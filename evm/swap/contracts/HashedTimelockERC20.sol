/* SPDX-License-Identifier: GNU */
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
* @title Hashed Timelock Contracts (HTLCs) on Ethereum ERC20 tokens.
*
* This contract provides a way to create and keep HTLCs for ERC20 tokens.
*
* See HashedTimelock.sol for a contract that provides the same functions
* for the native ETH token.
*
* Protocol:
*
*  1) newContract(receiver, hashlock, timelock, tokenContract, amount) - a
*      sender calls this to create a new HTLC on a given token (tokenContract)
*       for a given amount. A 32 byte contract id is returned
*  2) withdraw(hash, preimage) - once the receiver knows the preimage of
*      the hashlock hash they can claim the tokens with this function
*  3) refund() - after timelock has expired and if the receiver did not
*      withdraw the tokens the sender / creator of the HTLC can get their tokens
*      back with this function.
 */
contract HashedTimelockERC20 {
    event HTLCERC20New(
        address indexed sender,
        address indexed receiver,
        address tokenContract,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock
    );
    event HTLCERC20Withdraw(bytes32 indexed hashlock);
    event HTLCERC20Refund(bytes32 indexed hashlock);

    struct LockContract {
        address sender;
        address receiver;
        address tokenContract;
        uint256 amount;
        // locked UNTIL this time. Unit depends on consensus algorithm.
        // PoA, PoA and IBFT all use seconds. But Quorum Raft uses nano-seconds
        uint256 timelock;
        bool withdrawn;
        bool refunded;
        bytes32 preimage;
    }

    modifier tokensTransferable(address _token, address _sender, uint256 _amount) {
        require(_amount > 0, "token amount must be > 0");
        require(
            ERC20(_token).allowance(_sender, address(this)) >= _amount,
            "token allowance must be >= amount"
        );
        _;
    }
    modifier futureTimelock(uint256 _time) {
        // only requirement is the timelock time is after the last blocktime (now).
        // probably want something a bit further in the future then this.
        // but this is still a useful sanity check:
        require(_time > block.timestamp, "timelock time must be in the future");
        _;
    }
    modifier contractExists(bytes32 _hashlock) {
        require(haveContract(_hashlock), "contract does not exist");
        _;
    }
    modifier hashlockMatches(bytes32 _hashlock, bytes32 _x) {
        require(
            _hashlock == sha256(abi.encodePacked(_x)),
            "hashlock hash does not match"
        );
        _;
    }
    modifier withdrawable(bytes32 _hashlock) {
        require(contracts[_hashlock].receiver == msg.sender, "withdrawable: not receiver");
        require(contracts[_hashlock].withdrawn == false, "withdrawable: already withdrawn");
        // This check needs to be added if claims are allowed after timeout. That is, if the following timelock check is commented out
        require(contracts[_contractId].refunded == false, "withdrawable: already refunded");
        // if we want to disallow claim to be made after the timeout, uncomment the following line
        // require(contracts[_hashlock].timelock > now, "withdrawable: timelock time must be in the future");
        _;
    }
    modifier refundable(bytes32 _hashlock) {
        require(contracts[_hashlock].sender == msg.sender, "refundable: not sender");
        require(contracts[_hashlock].refunded == false, "refundable: already refunded");
        require(contracts[_hashlock].withdrawn == false, "refundable: already withdrawn");
        require(contracts[_hashlock].timelock <= block.timestamp, "refundable: timelock not yet passed");
        _;
    }

    mapping (bytes32 => LockContract) public contracts;

    /**
     * @dev Sender / Payer sets up a new hash time lock contract depositing the
     * funds and providing the reciever and terms.
     *
     * NOTE: _receiver must first call approve() on the token contract.
     *       See allowance check in tokensTransferable modifier.

     * @param _receiver Receiver of the tokens.
     * @param _hashlock A sha-2 sha256 hash hashlock.
     * @param _timelock UNIX epoch seconds time that the lock expires at.
     *                  Refunds can be made after this time.
     * @param _tokenContract ERC20 Token contract address.
     * @param _amount Amount of the token to lock up.
     * @return hashlock Id of the new HTLC. This is needed for subsequent
     *                    calls.
     */
    function newContract(
        address _receiver,
        bytes32 _hashlock,
        uint256 _timelock,
        address _tokenContract,
        uint256 _amount
    )
    external
    tokensTransferable(_tokenContract, msg.sender, _amount)
    futureTimelock(_timelock)
    returns (bytes32 hashlock)
    {
        // Reject if a contract already exists with the same parameters. The
        // sender must change one of these parameters (ideally providing a
        // different _hashlock).
        if (haveContract(_hashlock))
            revert("Contract already exists");

        // This contract becomes the temporary owner of the tokens
        if (!ERC20(_tokenContract).transferFrom(msg.sender, address(this), _amount))
            revert("transferFrom sender to this failed");

        contracts[_hashlock] = LockContract(
            msg.sender,
            _receiver,
            _tokenContract,
            _amount,
            _timelock,
            false,
            false,
            0x0
        );

        emit HTLCERC20New(
            msg.sender,
            _receiver,
            _tokenContract,
            _amount,
            _hashlock,
            _timelock
        );

        return _hashlock;
    }

    /**
    * @dev Called by the receiver once they know the preimage of the hashlock.
    * This will transfer ownership of the locked tokens to their address.
    *
    * @param _hashlock Id of the HTLC.
    * @param _preimage sha256(_preimage) should equal the contract hashlock.
    * @return bool true on success
     */
    function withdraw(bytes32 _hashlock, bytes32 _preimage)
    external
    contractExists(_hashlock)
    hashlockMatches(_hashlock, _preimage)
    withdrawable(_hashlock)
    returns (bool)
    {
        LockContract storage c = contracts[_hashlock];
        c.preimage = _preimage;
        c.withdrawn = true;
        ERC20(c.tokenContract).transfer(c.receiver, c.amount);
        emit HTLCERC20Withdraw(_hashlock);
        return true;
    }

    /**
     * @dev Called by the sender if there was no withdraw AND the time lock has
     * expired. This will restore ownership of the tokens to the sender.
     *
     * @param _hashlock Id of HTLC to refund from.
     * @return bool true on success
     */
    function refund(bytes32 _hashlock)
    external
    contractExists(_hashlock)
    refundable(_hashlock)
    returns (bool)
    {
        LockContract storage c = contracts[_hashlock];
        c.refunded = true;
        ERC20(c.tokenContract).transfer(c.sender, c.amount);
        emit HTLCERC20Refund(_hashlock);
        return true;
    }

    /**
     * @dev Get contract details.
     * @param _hashlock HTLC contract id
     * @return hashlock All parameters in struct LockContract for _hashlock HTLC
     */
    function getContract(bytes32 _hashlock)
    public
    view
    returns (
        bytes32 hashlock,
        address sender,
        address receiver,
        address tokenContract,
        uint256 amount,
        uint256 timelock,
        bool withdrawn,
        bool refunded,
        bytes32 preimage
    )
    {
        if (haveContract(_hashlock) == false)
            return (0, address(0), address(0), address(0), 0, 0, false, false, 0);
        LockContract storage c = contracts[_hashlock];
        return (
        _hashlock,
        c.sender,
        c.receiver,
        c.tokenContract,
        c.amount,
        c.timelock,
        c.withdrawn,
        c.refunded,
        c.preimage
        );
    }

    /**
     * @dev Is there a contract with id _hashlock.
     * @param _hashlock Id into contracts mapping.
     */
    function haveContract(bytes32 _hashlock)
    internal
    view
    returns (bool exists)
    {
        exists = (contracts[_hashlock].sender != address(0));
    }

}