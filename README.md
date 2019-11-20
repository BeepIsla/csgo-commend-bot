# CSGO Commend Bot
If you're a developer and want to know how to fix your own commend bot its very simple. Just set `steam_id_gs` to a valid server steam ID, on your target's account & bot accounts.

Please view the [Changelog](./CHANGELOG.md) for a simple list of changes

---

# Restrictions and Issues
There also is a limit of the amount of commends you can send within a specific amount of time, that limit is set to 20. Due to this I recommend leaving `perChunk` and `betweenChunks` default but you can always experiment around.

# Future
- Add the ability to remove commends
- Add the ability to commend three times with one account per 24 hours instead of once every 8 hours

# Requirements
- [NodeJS **v12**](https://nodejs.org/dist/v12.9.1/) - You will likely need `node-v12.9.1-x64.msi`
- [Little bit of JSON knowledge](https://www.json.org/)

# Installation
1. Download this repository
2. Open a command prompt *inside* the folder
3. Enter `npm install`
4. Rename `config.json.example` to `config.json` and adjust it ([See below](#config))
5. Add accounts using the [Database Manager](#database-manager)
6. Run `node index.js`

# Updating
Following the installation steps from `1` to `4` and simply override all files. **NEVER DELETE YOUR `accounts.sqlite` IT STORES ALL IMPORTANT INFORMATION - NOT ONLY ACCOUNT DETAILS**

# Config
- commend:
  - friendly `Number`: Amount of commends you want to send as friendly
  - teaching `Number`: Amount of commends you want to send as teaching
  - leader `Number`: Amount of commends you want to send as leader
- account:
  - username `String`: Username of the account you want to boost
  - password `String`: Pasword of the account you want to boost
  - sharedSecret `String`: Optional shared secret if the account has two factor authentication
- fetcher:
  - username `String`: Username of the account you want to use for automatically fetching server - Only required when using `auto` for `serverID` field - **Non-Prime accounts might encounter errors**
  - password `String`: Password of the account you want to use for automatically fetching server
  - sharedSecret `String`: Optional shared secret of the account you want to use for automatically fetching server
  - maxTries `Number`: Maximum amount of tries before cancelling fetching
  - tryDelay `Number`: Amount of milliseconds to wait between each try
  - askSteamGuard `Boolean`: Set to `true` if you want the script to ask for Steam Guard code, false to just error and cancel
- method `String`: Define the method - Valid values: `LOGIN` & `SERVER` - [Read More](#botting-method)
- target `String`: SteamID/VanityURL/ProfileURL of target
- serverID `String`: ServerID, **or** IP, **or** `auto` of the server - [Read More](#server-id)
- matchID `String`: Optional match ID, typically just `"0"` anyways - I always use `"0"`.
- perChunk `Number`: `toSend` will be split into parts of `perChunk` size
- betweenChunks `Number`: Cooldown in milliseconds to wait after each part/chunk
- cooldown `Number`: Cooldown in milliseconds to not reuse accounts - Currently set to 8 hours
- steamWebAPIKey `String`: Steam Web API key from [here](https://steamcommunity.com/dev/apikey)

# Database Manager
- `Export account list`: Export all accounts in a `username:password` format
- `List commends for user`: List **all** accounts which have commended a specific user
- `Reset commends for user`: Delete **all** commend entries from the database of a specific user
- `Remove account from database`: Delete a specific account from the database including commend history
- `Add account(s) to database`: Add accounts to the database, import from JSON file, import from `username:password` file or manually add accounts
- `List not working accounts`: List **all** accounts which are marked as inoperational by the script
- `Reset Database`: Will clear out **all** content of the database, resetting it to the default
- `Exit`: Safely close database before exiting process

Simply run it via `node databaseManager.js`, use the arrow keys & enter to navigate. Read on-screen instructions for more details.

# Botting Method
You can choose between two botting methods, `LOGIN` and `SERVER`.

- `LOGIN` will log into the targets account and automatically grab a server. `account` object **must** be filled with account details. Will ignore `target` & `serverID`.
- `SERVER` will assume the target is on the defined server - [Read More](#server-id)

# Server ID
The `serverID` field allows for either ServerIP, ServerID or `auto`. Make sure that the server has enough space for your bots. Full servers will not work.

- Server IP is self explanatory.
- ServerID can be found by entering `status` into the console ingame.
- - On a community server it will look like this: `1.37.0.1/13701 934/7508 secure  [A:1:1297634312:12708]` > `[A:1:1297634312:12708]`.
- - On a Valve server it will look like this: `Connected to =[A:1:3849827331:12657]:0` > `[A:1:3849827331:12657]`.
- - *Make sure to **only** include the stuff between the brackets and the brackets themselves.*
- `auto` will automatically try and find the correct server the target is on. This works for Casual, Deathmatch or War Games on official Valve servers (Requires `cl_join_advertise` to be `1` or higher) and on any community servers (Requires `cl_join_advertise` to be `2` or higher)
  - **Using `auto` requires you to use a `fetcher` account in your config**
  - Certain privacy settings may interfer with this, before reporting an issue make sure everything is set to public in your [Steam Privacy Settings](https://steamcommunity.com/my/edit/settings)
