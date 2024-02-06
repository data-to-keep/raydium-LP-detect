const bs58 = require("bs58");
require("dotenv").config();
const {
    clusterApiUrl,
    Connection,
    Keypair
} = require("@solana/web3.js");
const {
    LOOKUP_TABLE_CACHE,
    MAINNET_PROGRAM_ID,
    DEVNET_PROGRAM_ID,
    TxVersion,
} = require("@raydium-io/raydium-sdk");
const {
    createOpenBookMarket,
    createPool,
    removeLiquidity
} = require("./controlLP");
const {
    createMetaData, 
    createToken
} =require("./createToken");

const DEVNET_MODE = process.env.DEVNET_MODE === "true";
const PROGRAMIDS = DEVNET_MODE ? DEVNET_PROGRAM_ID : MAINNET_PROGRAM_ID;
const addLookupTableInfo = DEVNET_MODE ? undefined : LOOKUP_TABLE_CACHE;
const makeTxVersion = TxVersion.V0; // LEGACY
const connection = new Connection(DEVNET_MODE ? clusterApiUrl("devnet") : process.env.MAINNET_RPC_URL, "confirmed");
const payer = Keypair.fromSecretKey(bs58.decode(process.env.PAYER_SECRET_KEY));
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;

console.log("Payer:", payer.publicKey.toBase58());
console.log("Mode:", DEVNET_MODE ? "devnet" : "mainnet");

const main = (stage) => {
    switch (stage) {
        case 0:
            createToken(connection, 6, 1000000000);
            break;
        case 1:
            createMetaData(connection, TOKEN_ADDRESS, "TTTT-TOKEN", "TTTT");
            break;
        case 2:
            createOpenBookMarket(connection, payer, makeTxVersion, addLookupTableInfo, PROGRAMIDS, TOKEN_ADDRESS, 1, 0.000001);
            break;
        case 3:
            createPool(connection, payer, makeTxVersion, addLookupTableInfo, PROGRAMIDS, TOKEN_ADDRESS, 1000000000, 2);
        case 4:
            let myVar = setInterval((sol) => removeLiquidity(connection, payer, makeTxVersion, addLookupTableInfo, PROGRAMIDS, TOKEN_ADDRESS), 2000);
            if (sol > 20) {
                clearInterval(myVar);
            }
        default:
            console.log("Input number[0 ~ 4].");
            break;
    }
}

main(4);
