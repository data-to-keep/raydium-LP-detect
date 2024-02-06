const BN = require("bn.js");
const BigNumber = require("bignumber.js");
require("dotenv").config();
const {
    VersionedTransaction,
} = require("@solana/web3.js");

const {
    TOKEN_PROGRAM_ID,
    SPL_ACCOUNT_LAYOUT
} = require("@raydium-io/raydium-sdk");


export const xWeiAmount = (amount, decimals) => {
    return new BN(new BigNumber(amount.toString() + "e" + decimals.toString()).toFixed(0));
};

export const getWalletTokenAccount = async (connection, wallet) => {
    const walletTokenAccount = await connection.getTokenAccountsByOwner(wallet, {
        programId: TOKEN_PROGRAM_ID,
    });
    return walletTokenAccount.value.map((i) => ({
        pubkey: i.pubkey,
        programId: i.account.owner,
        accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
    }));
};

export const sendAndConfirmTransactions = async (connection, payer, transactions) => {
    for (const tx of transactions) {
        let signature;
        if (tx instanceof VersionedTransaction) {
            tx.sign([payer]);
            signature = await connection.sendTransaction(tx);
        }
        else
            signature = await connection.sendTransaction(tx, [payer]);
        await connection.confirmTransaction({ signature });
    }
};

