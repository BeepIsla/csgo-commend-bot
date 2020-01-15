# Changelog

## 2.5.1
- Added `databaseManager` option to set operational status
  - Use this if an account has been marked as invalid

## 2.5.0
- Fix automatic protobuf downloading not working
- Lower RAM usage for each worker process
  - Should also increase speed a little bit
  - Protobufs are now compiled once per worker instead of once per account
- Potentially fix issue with `LOGIN` method - [#206](https://github.com/BeepIsla/csgo-commend-bot/issues/206)
- Add second method for checking for a VAC ban
- Mark game banned accounts as invalid

## 2.4.7
- Added option to skip update checks
  - Set `disableUpdateCheck` to `true` in your config to skip update checks

## 2.4.6
- Fixed `Account Disabled` error code not marking account as invalid

## 2.4.5
- Added advanced config error logging to database manager
- Proxies now wrap around (Allowing for 40 commends per 5 minutes with 2 proxies for example)
- Fixed a typo

## 2.4.4
- Fix a maximum call stack size exceeded error
- Ensure match ID is always valid

## 2.4.3
- Improve error logging
- Handle errors which do not happen during login
- Reduce Valve server ID timeout
- Fix process not exiting in some situation

## 2.4.2
- Added Valve server ID fetcher - Thanks [@ZOODEN](http://github.com/ZOODEN)
  - [Read More](./README.md#server-id--match-id)

## 2.4.1
- Fix report bot

## 2.4.0
- Added proxy support - Thanks [@UnbreakCode](http://github.com/UnbreakCode)
  - [Read More](./README.md#proxies)

## 2.3.0
- Removed check whether or not server is full
- Added report functionality back
  - Set `type` in the config to `REPORT`
- Added auto matchID (**Requires fetcher**)
  - Set `matchID` to `auto` to use
  - Only works on Valve Matchmaking servers

## 2.2.6
- Fix process being stuck on some occasions ([#147](https://github.com/BeepIsla/csgo-commend-bot/issues/147))

## 2.2.5
- Fixed error logging

## 2.2.4
- Do not allow full servers to be used ([#76](https://github.com/BeepIsla/csgo-commend-bot/issues/76))
- Error on VAC banned accounts ([#100](https://github.com/BeepIsla/csgo-commend-bot/issues/100))

## 2.2.3
- Handle response code 2 (Already commended)

## 2.2.2
- Fix logging bug

## 2.2.1
- Fix automatic Server ID finder now working

## 2.2.0
- Changed commending system to use numbers instead of boolean

## 2.1.0
- Added automatic Server ID finder

## 2.0.0
- Commend bot has been rewritten
