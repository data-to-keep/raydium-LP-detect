1. environment
	node.js version : v20.11.0
	solana-cli 1.17.17
2. run
	node main
3. description
	- Firstly create token. (main parameter = 0)
		before create token, change PAYER_SECRET_KEY with your wallet pubkey.
		if creatig token is success, overwrite .env file with token address
	- link to token metadata. (main parameter = 1)
	- create market. (main parameter = 2)
		if creatig market is success, overwrite .env file with market ID
	- create pool. (main parameter = 3)
		if creatig pool is success, overwrite .env file with pool address(AMM ID)
	- tracking pool. (main parameter = 4)
 
	