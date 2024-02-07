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
    LOOKUP_TABLE_CACHE,
    MAINNET_PROGRAM_ID,
    DEVNET_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    TxVersion,
    buildSimpleTransaction
} = require("@raydium-io/raydium-sdk");
const { Market, MARKET_STATE_LAYOUT_V3 } = require("@project-serum/serum");
const {
    createOpenBookMarket,
    createPool,
} = require("./controlLP");
const {
    createMetaData, 
    createToken
} =require("./createToken");

/* variables */
const DEVNET_MODE = process.env.DEVNET_MODE === "true";
const PROGRAMIDS = DEVNET_MODE ? DEVNET_PROGRAM_ID : MAINNET_PROGRAM_ID;
const addLookupTableInfo = DEVNET_MODE ? undefined : LOOKUP_TABLE_CACHE;
const makeTxVersion = TxVersion.V0; // LEGACY
const connection = new Connection(DEVNET_MODE ? clusterApiUrl("devnet") : process.env.MAINNET_RPC_URL, "confirmed");
const payer = Keypair.fromSecretKey(bs58.decode(process.env.PAYER_SECRET_KEY));
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
const TRADING_PERIOD = 3000; // ms 
let solLP = 0;
let timer;
let poolKeys;

console.log("Payer:", payer.publicKey.toBase58());
console.log("Mode:", DEVNET_MODE ? "devnet" : "mainnet");


/* functions definition */
const trackingInit = async () => {
    console.log("LP Initializing... ");
    
    const mint = new PublicKey(TOKEN_ADDRESS);
    const mintInfo = await getMint(connection, mint);

    const baseToken = new Token(TOKEN_PROGRAM_ID, TOKEN_ADDRESS, mintInfo.decimals);
    const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");

    const marketAccounts = await Market.findAccountsByMints(connection, baseToken.mint, quoteToken.mint, PROGRAMIDS.OPENBOOK_MARKET);
    if (marketAccounts.length === 0) {
        console.log("Not found market info");
        return;
    }
    const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccounts[0].accountInfo.data);
    poolKeys = Liquidity.getAssociatedPoolKeys({
        version: 4,
        marketVersion: 3,
        baseMint: baseToken.mint,
        quoteMint: quoteToken.mint,
        baseDecimals: baseToken.decimals,
        quoteDecimals: quoteToken.decimals,
        marketId: marketAccounts[0].publicKey,
        programId: PROGRAMIDS.AmmV4,
        marketProgramId: PROGRAMIDS.OPENBOOK_MARKET,
    });
    poolKeys.marketBaseVault = marketInfo.baseVault;
    poolKeys.marketQuoteVault = marketInfo.quoteVault;
    poolKeys.marketBids = marketInfo.bids;
    poolKeys.marketAsks = marketInfo.asks;
    poolKeys.marketEventQueue = marketInfo.eventQueue;
 }

const trackingSOL = async () => {
    extraPoolInfo = await Liquidity.fetchInfo({ connection, poolKeys });
    solLP = extraPoolInfo.quoteReserve.toNumber();
    console.log("======== SOL of LP:", solLP);

    if (solLP > 20000000000) { // 20 SOL
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

const main = (stage) => {
    switch (stage) {
        case 0:
            createToken(connection, payer, 6, 1000000000);
            break;
        case 1:
            createMetaData(connection, payer, TOKEN_ADDRESS, "TEST-TOKEN", "TEST");
            break;
        case 2:
            createOpenBookMarket(connection, payer, makeTxVersion, addLookupTableInfo, PROGRAMIDS, TOKEN_ADDRESS, 1, 0.000001);
            break;
        case 3:
            createPool(connection, payer, makeTxVersion, addLookupTableInfo, PROGRAMIDS, TOKEN_ADDRESS, 1000000000, 2, DEVNET_MODE);
            break;
        case 4:
            trackingInit();
            timer = setInterval(()=>trackingSOL(), TRADING_PERIOD);
            break;
        default:
            console.log("Input integer[0 ~ 4].");
            break;
    }
}

main(4);
