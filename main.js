const bs58 = require("bs58");
require("dotenv").config();
const {
    clusterApiUrl,
    Connection,
    PublicKey,
    Keypair
} = require("@solana/web3.js");
const {
    getMint,
    getOrCreateAssociatedTokenAccount,
} = require("@solana/spl-token");
const {
    Token,
    TokenAmount,
    Liquidity,
    ENDPOINT,
    RAYDIUM_MAINNET,
    LOOKUP_TABLE_CACHE,
    MAINNET_PROGRAM_ID,
    DEVNET_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    TxVersion,
    jsonInfo2PoolKeys
} = require("@raydium-io/raydium-sdk");
const {
    createOpenBookMarket,
    createPool,
} = require("./controlLP");
const {
    createMetaData, 
    createToken
} =require("./createToken");
const fs =require("fs");

/* variables */
const DEVNET_MODE = process.env.DEVNET_MODE === "true";
const PROGRAMIDS = DEVNET_MODE ? DEVNET_PROGRAM_ID : MAINNET_PROGRAM_ID;
const addLookupTableInfo = DEVNET_MODE ? undefined : LOOKUP_TABLE_CACHE;
const makeTxVersion = TxVersion.V0; // LEGACY
const connection = new Connection(DEVNET_MODE ? clusterApiUrl("devnet") : clusterApiUrl("mainnet-beta"), "confirmed");
const payer = Keypair.fromSecretKey(bs58.decode(process.env.PAYER_SECRET_KEY));
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
const TRADING_PERIOD = 3000; // ms 
const GOAL_SOL = 13000000000;
let solLP = 0;
let timer;
let poolKeys;

console.log("Payer:", payer.publicKey.toBase58());
console.log("Mode:", DEVNET_MODE ? "devnet" : "mainnet");


/* functions definition */
const trackingInit = async () => {
    console.log("LP Initializing... ");
    // -------- pre-action: fetch basic info --------
    const ammV2PoolData = await fetch(ENDPOINT + RAYDIUM_MAINNET.poolInfo).then((res) => res.json())
    const targetPoolInfo = [...ammV2PoolData.official, ...ammV2PoolData.unOfficial].find((poolInfo) => poolInfo.id === process.env.AMM_ID);
    console.log("targetPoolInfo : ", targetPoolInfo);
    poolKeys = jsonInfo2PoolKeys(targetPoolInfo);

    console.log("LP was initialized.marketId : ", targetPoolInfo.marketId)
}

const trackingSOL = async () => {
    extraPoolInfo = await Liquidity.fetchInfo({ connection, poolKeys });
    solLP = extraPoolInfo.quoteReserve.toNumber();
    console.log("======== SOL of LP:", solLP);

    if (solLP > GOAL_SOL) {
        const lpToken = new Token(TOKEN_PROGRAM_ID, poolKeys.lpMint, poolKeys.lpDecimals);
        const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, payer, poolKeys.lpMint, payer.publicKey);
        console.log("========= lpToken:", lpToken)
        console.log("========= tokenAccount : ",tokenAccount)

        const amountIn = new TokenAmount(lpToken, tokenAccount.amount);
        console.log("========= amountIn : ", amountIn);

        let innerTransactions;
        if (DEVNET_MODE === false) {
            innerTransactions = await Liquidity.makeRemoveLiquidityInstructionSimple({
                connection,
                poolKeys,
                userKeys: {
                    owner: payer.publicKey,
                    payer: payer.publicKey,
                    tokenAccounts: walletTokenAccounts,
                },
                amountIn: amountIn,
                makeTxVersion,
            });
            const transactions = await buildSimpleTransaction({
                connection,
                makeTxVersion,
                payer: payer.publicKey,
                innerTransactions,
                addLookupTableInfo,
            });
            await sendAndConfirmTransactions(connection, payer, transactions);
        }
        console.log("======== Your LP was removed from Raydium.");
        clearInterval(timer);
    }
}

const main = async (stage) => {
    try{
    switch (stage) {
        case 0:
            createToken(connection, payer, 6, 1000000000);
            break;
        case 1:
            createMetaData(connection, payer, TOKEN_ADDRESS, "WIF ANITA", "WIFANI");
            break;
        case 2:
            createOpenBookMarket(connection, payer, makeTxVersion, addLookupTableInfo, PROGRAMIDS, TOKEN_ADDRESS, 1, 0.000001);
            break;
        case 3:
            createPool(connection, payer, makeTxVersion, addLookupTableInfo, PROGRAMIDS, TOKEN_ADDRESS, 100000000, 5, DEVNET_MODE);
            break;
        case 4:
            await trackingInit();
            timer = setInterval(()=>trackingSOL(), TRADING_PERIOD);
            break;
        default:
            console.log("Input integer[0 ~ 4].");
            break;
    }
}catch(err){
    console.error(err);
}
}

main(4);
