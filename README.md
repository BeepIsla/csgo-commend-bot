# CSGO Commend Bot
Allows you to send commends and reports for CSGO, though commend botting is the focus of it and reporting is just a little side thing.

*Note: Even though I have implemented a report bot I still believe they are fixed. - [**Read More**](#why-i-think-report-bots-are-fixed)*

**Please view the [Changelog](./CHANGELOG.md) for a list of changes.**

**Please read the README in its entirety before coming to me asking for help.**

**[Frequently Asked Questions](#frequently-asked-questions)**

---

# Requirements
- [NodeJS **v12**](https://nodejs.org/dist/v12.9.1/) - You will likely need `node-v12.9.1-x64.msi`
- [Little bit of JSON knowledge](https://www.json.org/)

# Installation
1. Download this repository
2. Open a command prompt *inside* the folder
3. Enter `npm ci`
4. Rename `config.json.example` to `config.json` and adjust it ([See below](#config))
5. Add accounts using the [Database Manager](#database-manager)
6. Run `node index.js`

# Updating
Following the installation steps from `1` to `4` and simply override all files. **NEVER DELETE YOUR `accounts.sqlite` IT STORES ALL IMPORTANT INFORMATION - NOT ONLY ACCOUNT DETAILS**

# Config

Some values are not always used:

- Using type `COMMEND` the entire `report` section is ignored
- Using type `REPORT` the entire `commend` section is ignored
- Using `auto` in `serverID` or `matchID` will **require** an account to be entered in the `fetcher` section
- Using method `LOGIN` ignored the entire `report`, `fetcher`, `serverID`, and `matchID` section but will **require** you to enter an account in the `account` section, other way around for using the `SERVER` method
- A `steamWebAPIKey` is **always** required, it doesn't matter which key you use

Explanation of each value:

- commend:
  - friendly `Number`: Amount of commends you want to send as friendly
  - teaching `Number`: Amount of commends you want to send as teaching
  - leader `Number`: Amount of commends you want to send as leader
- report:
  - aimbot `Number`: Amount of reports you want to send as aimbotting
  - wallhack `Number`: Amount of reports you want to send as wallhacking
  - speedhack `Number`: Amount of reports you want to send as other hacking
  - abusive `Number`: Amount of reports you want to send as abusive communications or profile
- account:
  - username `String`: Username of the account you want to boost
  - password `String`: Pasword of the account you want to boost
  - sharedSecret `String`: Optional shared secret if the account has two factor authentication
- fetcher:
  - username `String`: Username of the account you want to use for automatically fetching `serverID`/`matchID`
  - password `String`: Password of the account
  - sharedSecret `String`: Optional shared secret of the account
  - maxTries `Number`: Maximum amount of tries before cancelling fetching
  - tryDelay `Number`: Amount of milliseconds to wait between each try
  - askSteamGuard `Boolean`: Set to `true` if you want the script to ask for Steam Guard code, `false` to just error and cancel
- proxy:
  - enabled `Boolean`: Whether or not proxies are suppose to be used
  - file `String`: The filename you want to load proxies from (With extension like `.txt` or `.json`) - [Read More](#proxies)
  - switchProxyEveryXaccounts `Number`: One proxy per X accounts
- type `String`: Define the type - Valid values are `COMMEND` & `REPORT` - [Read More](#botting-type)
- method `String`: Define the method - Valid values: `LOGIN` & `SERVER` - [Read More](#botting-method)
- target `String`: SteamID/VanityURL/ProfileURL of target
- serverID `String`: ServerID, **or** IP, **or** `auto` of the server - [Read More](#server-id-&-match-id)
- matchID `String`: Optional match ID (Use `"0"` if you don't want to use one) - [Read More](#server-id-&-match-id)
- perChunk `Number`: Will chunk all accounts into groups of `perChunk` size
- betweenChunks `Number`: Delay in milliseconds between chunks
- cooldown `Number`: Cooldown in milliseconds to not reuse accounts
- showCommends `Boolean`: Whether or not to print commends at the start and end of commending (**Enabling this requires a fetcher account**)
- autoReportOnMatchEnd `Boolean`: If enabled and target is on a Valve Matchmaking server wait until the match has ended (**Enabling this requires a fetcher account**)
- switchServerAfterChunks `Number`: **When using `LOGIN` method** switch server automatically after this many chunks have been processed
- protocol `String`: Either `Auto`, `TCP`, `WebSocket`, or `WebCompatibility` - Specify the connection protocol to use for Steam. Try changing this if you encounter `Method Not Allowed`
- steamWebAPIKey `String`: Steam Web API key from [here](https://steamcommunity.com/dev/apikey)
- disableUpdateCheck `Boolean`: Whether or not to skip update checks

# Database Manager

- `Export account list`: Export all accounts in a `username:password` format
- `List commends for user`: List **all** accounts which have commended a specific user
- `Reset commends for user`: Delete **all** commend entries from the database of a specific user (*Note: This does **not** remove commends from the target in-game. You will likely **never** have to use this*)
- `Remove account from database`: Delete a specific account from the database including commend history **\***
- `Add account(s) to database`: Add accounts to the database, import from JSON file, import from `username:password` file or manually add accounts
- `List not working accounts`: List **all** accounts which are marked as inoperational by the script
- `Remove all not working accounts`: Remove **all** accounts which have been marked as not working **\***
- `Get last commend target and time`: Retrieve the last target and time at which we commended
- `Reset Database`: Will clear out **all** content of the database, resetting it to the default
- `Exit`: Safely close database before exiting process

Simply run it via `node databaseManager.js`, use the arrow keys & enter to navigate. Read on-screen instructions for more details.

**\*** Commend history is **important**, removing it will cause the script to re-use already used accounts which will result in duplicate commends, which does not work and will therefore do nothing until commend history has been rebuilt.

# Botting Type

You can choose between two types, `COMMEND` and `REPORT`.

There isn't much to it. Commending botting is confirmed to work, report botting **is impossible to prove working** due to many factors which cannot be controlled. I believe report bots haven't worked since 2016 due to how simple it is to prevent them working. Don't try to lecture me, I don't care.

# Botting Method

You can choose between two botting methods, `LOGIN` and `SERVER`.

- `LOGIN` will log into the targets account and automatically grab a server. Fastest, easiest and most lightweight (No need to run CSGO) for personal usage
  - Note: Do **not** have CSGO open while using this method
- `SERVER` will commend a target, but the target **has** to be on a valid Valve or Community server - [Read More](#server-id-&-match-id)
  - Note: You **cannot** bot someone without them being on a server

# Server ID & Match ID

- The `serverID` field allows for either ServerIP, ServerID or `auto`.
  - Server IP is self explanatory
  - ServerID can be found by entering `status` into the console ingame.
    - On a community server it will look like this: `1.37.0.1/13701 934/7508 secure  [A:1:1297634312:12708]` > `[A:1:1297634312:12708]`.
    - On a Valve server it will look like this: `Connected to =[A:1:3849827331:12657]:0` > `[A:1:3849827331:12657]`.
    - *Make sure to **only** include the stuff between the brackets and the brackets themselves.*
  - `auto` will work on any server, community server **require** the target to use `cl_join_advertise` to be `2` or higher
    - **Requires** an account filled in the `fetcher` section
    - Certain privacy settings may interfer with this, before reporting an issue make sure everything is set to public in your [Steam Privacy Settings](https://steamcommunity.com/my/edit/settings)
- The `matchID` field allows for either MatchID or `auto`. 
  - MatchID can be found at the start of a match before the accept match popup comes up `match_id=3243320471183730331` > `3243320471183730331`
  - `auto` will automatically find the match ID for you
  -  **Requires** an account filled in the `fetcher` section

# Proxies
Proxies are simple to use, just follow the example config to set them up. Your proxy file will need to be either a JSON array with each element being one HTTP proxy *or* a plain text file with each line being one proxy. One proxy can do ~20 commends, so I recommend leaving `switchProxyEveryXaccounts` at `20`.

**ONLY HTTP proxies are supported**

JSON Example:
```JSON
[
    "127.0.0.1:12345",
    "127.0.0.1:67890",
    "127.0.0.2:12345",
    "127.0.0.2:67890"
]
```

Plain text example:
```
127.0.0.1:12345
127.0.0.1:67890
127.0.0.2:12345
127.0.0.2:67890
```

# Frequently Asked Questions

- I am getting timeout errors
  - You cannot use this bot on a live Valve Competitive/Wingman match, however it does work at the end of the match when the last round ends. Otherwise just use Community Servers or Valve Casual/Deathmatch/War Games/etc. Offline with bots or local workshop maps do not work.

- Can I get banned for using this?
  - Who knows, maybe, maybe not. Its unlikely but you never know. Valve usually *at most* disables the bot accounts.

- I get an error when trying `npm ci`
  - As said in the README, make sure to install [**NodeJS version 12**](https://nodejs.org/dist/v12.9.1/). On Windows you will need to download the `node-v12.9.1-x64.msi`.

- How many commends can I send?
  - One IP can do ~20 commends per 5 minutes
    - There don't seem to be any other way to increase this, I tried modifying several things and nothing ever worked
  - Its *possible* there is a server limit as well of ~150 commends. This is unconfirmed and might not be true.
  - *Note: This information may be outdated*

- I get a proxy error!
  - Your proxy has been banned by Steam. Search for residential proxies, and even then they might be banned.

- I get an "Failed to commend" error
  - This is likely an error on your side, if it worked before and you cannot resolve the issue [look through the issue list on Github and open a new one if required](https://github.com/BeepIsla/csgo-commend-bot/issues?utf8=%E2%9C%93&q=is%3Aissue).

- The config is confusing, can you make an interface for it?
  - I can but I won't. It doesn't accomplish anything and learning how this works is easy.

- Can I make an automated commend selling service with this?
  - This is **not** usable on a big scale, especially when botting several people at once.

- Can you do X for me?
  - No, I only work for myself.

- Can you do X for me? I pay!
  - No, I don't care about money.

- I found someone who copied this and is selling it/released it without mentioning you.
  -  Good for them, I don't care. I have still made the accomplishment, not them.

# Why I think report bots are fixed

Lets start by saying: **None of this is confirmed, nobody knows what the truth is so these are just assumptions.**

Aside from [**Valve literally saying they are fixed**](https://www.reddit.com/r/GlobalOffensive/comments/89qk3l/i_emailed_a_valve_employee_about_csgo_and_got_a/dwtqe94/) every match (Competitive, Wingman, Danger Zone, etc) has a list of account IDs which are allowed to join/participate, so when a report gets sent all Valve has to do is check if the sender and receiver are in the same match or not.

Now you could argue why doesn't the same happen when commending or why do they give a fake response? The answer is: Community servers.

Commending must work on community servers so it is not as strict as reporting. Reporting on the other hand is completely irrelevant on community servers, there is no reason why Valve should use them especially considering community servers may give advantages to some players, so reporting simply returns a fake response.

- Is sender and receiver assigned to the same Valve match?
  - Yes: Real report
  - No: Is the server ID the same for sender and receiver?
    - Yes: Send a fake response
    - No: Do not respond at all
