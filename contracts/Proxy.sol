pragma solidity =0.5.12;

import "hardhat/console.sol";

contract DaiProxy {
    
    // address impl = '0x';

    function pt(address impl, bytes memory pdat, bytes memory tdat) public {
        impl.call(pdat);
        impl.call(tdat);
    }

    function ptf(address impl, bytes memory pdat, bytes memory tdat, bytes memory fdat) public {
        impl.call(pdat);
        impl.call(tdat);
        impl.call(fdat);
    }

    function tf(address impl, bytes memory tdat, bytes memory fdat) public {
        impl.call(tdat);
        impl.call(fdat);
    }

}