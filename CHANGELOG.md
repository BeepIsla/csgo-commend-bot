# Changelog

## 2.10.0
- Added optional config option `protocol` to force a specific connection protocol ([#537](https://github.com/BeepIsla/csgo-commend-bot/issues/537))

## 2.9.0
- Potentially fixed commend bot freezing & erroring with "UnhandledPromiseRejection" ([#496](https://github.com/BeepIsla/csgo-commend-bot/issues/496))
- Added option to remove all accounts from the database without removing commend history ([#491](https://github.com/BeepIsla/csgo-commend-bot/issues/491))
- Added report bot option to wait until Valve Matchmaking game has ended before reporting ([#499](https://github.com/BeepIsla/csgo-commend-bot/issues/499))

## 2.8.4
- Fix [#477](https://github.com/BeepIsla/csgo-commend-bot/issues/477)

## 2.8.3
- Small display change to how commends are displayed when using `showCommends`
- Changed preloading to simply commend twice
  - Fixes chunk count being wrong sometimes
  - Fixes duplicate entries in database

## 2.8.2
- Fix database manager

## 2.8.1
- Preloading now waits much shorter before rejecting when commending/reporting
- Added commend display option
  - `showCommends` in your `config.json`, set this to `true` to see commends at the start and end of the process, as well as the difference
  - **Enabling this requires a fetcher account**

## 2.8.0
- Re-added ServerID, MatchID and Fetcher
- Updated all libraries to their latest version
- Improved protobuf checker
- Fixed commend bot
  - Probably still **does not** work on Competitive/Wingman
  - Thanks [inbroso](https://github.com/inbroso)

## 2.7.1
- Increased authorization timeout from 5 to 20 seconds
- Increased deauthorization timeout from 1 to 5 seconds
- More internal code changes
- Better error handling

## 2.7.0
- Removed ServerID
- Removed MatchID
- Removed fetcher
- Updated libraries
- Internal code changes

## 2.6.1
- Fixed commend/report bot
  - No longer works on Competitive and Wingman
    - More handling and error messages for this will be added soon
  - `LOGIN` method might no longer work correctly
  - Thanks [PixLSteam](https://github.com/PixLSteam) & [Amerrrrr](https://github.com/Amerrrrr)
- Smaller internal changes

## 2.6.0
- Added automatic server switcher
  - **This only works for `LOGIN` method**

## 2.5.3
- Removed abusive voice reports
  - Voice and Text abuse is now combined in `abusive` - [Read CSGO's Blog Post for more information](https://blog.counter-strike.net/index.php/2020/02/28450/)
  - *While its technically still possible to report for voice abuse it is now unused*

## 2.5.2
- Fixed automatic protobuf downloader not working

## 2.5.1
- Added `databaseManager` option to set operational status
  - Use this if an account has been marked as invalid without resetting commend history

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
