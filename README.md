# CSGO Commend Bot

Allows you to send commends and reports ín CSGO using bots, though commend botting is the focus of it and reporting is just a little side thing.

**Please view the [Changelog](./CHANGELOG.md) for a list of changes.**

**[Frequently Asked Questions](#frequently-asked-questions)**

---

# Limitations

Since [Valve's update on the 11th February 2020](https://blog.counter-strike.net/index.php/2020/02/28557/) you **can no longer** commend/report bot on Competitive/Wingman Matchmaking. Casual gamemodes such as Deathmatch/Casual/etc continue to work including community servers.

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

## Updating

Following the installation steps from `1` to `4` and simply override all files. **NEVER DELETE YOUR `accounts.sqlite` IT STORES ALL IMPORTANT INFORMATION - NOT ONLY ACCOUNT DETAILS**

# Config

Some values are not always used:
- Using type `COMMEND` the entire `report` section is ignored
- Using type `REPORT` the entire `commend` section is ignored
- Using method `LOGIN` **requires** you to enter an account in the `account` section
- Using method `SERVER` the entire `account` section is ignored
- A `steamWebAPIKey` is **always** required, it does not matter what API key you use, it just has to be valid

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
- proxy:
  - enabled `Boolean`: Whether or not proxies are suppose to be used
  - file `String`: The filename you want to load proxies from (With extension like `.txt` or `.json`) - [Read More](#proxies)
  - switchProxyEveryXaccounts `Number`: One proxy per X accounts
- type `String`: Define the type - Valid values are `COMMEND` & `REPORT` - [Read More](#botting-type)
- method `String`: Define the method - Valid values: `LOGIN` & `SERVER` - [Read More](#botting-method)
- target `String`: SteamID/VanityURL/ProfileURL of target
- perChunk `Number`: Will chunk all accounts into groups of `perChunk` size
- betweenChunks `Number`: Delay in milliseconds between chunks
- cooldown `Number`: Cooldown in milliseconds to not reuse accounts
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

There isn't much to it. Commending botting is confirmed to work, report botting **is impossible to prove working** due to many factors which cannot be controlled. I believe report bots haven't worked since 2016 due to how simple it is to prevent them working.

# Botting Method

You can choose between two botting methods, `LOGIN` and `SERVER`.

- `LOGIN` will log into the targets account. Fastest, easiest and most lightweight (No need to run CSGO) for personal usage
  - Note: Do **not** have CSGO open while using this method
- `SERVER` will commend a specified target, but the target **has** to be on a non-competitive server - [Read More](#limitations)

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

- Can I get banned for using this?
  - Who knows, maybe, maybe not. Its unlikely but you never know. Valve usually *at most* disables the bot accounts.

- I get an error when trying `npm install`
  - As said in the README, make sure to install [**NodeJS version 12**](https://nodejs.org/dist/v12.9.1/). On Windows you will need to download the `node-v12.9.1-x64.msi`.

- How many commends can I send?
  - One IP can do ~20 commends per 5 minutes
    - There don't seem to be any other way to increase this, I tried modifying several things and nothing ever worked
  - Its *possible* there is a server limit as well of ~150 commends. This is unconfirmed and might not be true.

- I am a developer and I am making my own commend bot, how do you bypass Valve's fix?
  - [Send an authlist-protobuf message to Steam.](https://github.com/BeepIsla/csgo-commend-bot/blob/bc8435003e92db917a6c87dc700a0ec56f867802/helpers/account.js#L229)

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
