pragma solidity =0.5.12;

import "hardhat/console.sol";

contract DaiProxy {
    
    // address impl = '0x';

    function pt(address impl, bytes memory pdat, bytes memory tdat) public {
        run(impl, pdat);
        run(impl, tdat);
    }

    function ptf(address impl, bytes memory pdat, bytes memory tdat, bytes memory fdat) public {
        run(impl, pdat);
        run(impl, tdat);
        run(impl, fdat);
    }

    function tf(address impl, bytes memory tdat, bytes memory fdat) public {
        run(impl, tdat);
        run(impl, fdat);
    }

    function run(address impl, bytes memory data) public returns (bytes memory response) {
        // call contract in current context
        assembly {
            let succeeded := delegatecall(sub(gas, 5000), impl, add(data, 0x20), mload(data), 0, 0)
            let size := returndatasize

            response := mload(0x40)
            mstore(0x40, add(response, and(add(add(size, 0x20), 0x1f), not(0x1f))))
            mstore(response, size)
            returndatacopy(add(response, 0x20), 0, size)

            switch iszero(succeeded)
            case 1 {
                // throw if delegatecall failed
                revert(add(response, 0x20), size)
            }
        }
    }

}