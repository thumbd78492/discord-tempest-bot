import { Client, GatewayIntentBits } from 'discord.js'
import { PingSlashCommand } from './commands/ping'
import { deploySlashCommands } from './deploy'
import dotenv from 'dotenv'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/Either'
import * as TE from 'fp-ts/TaskEither'
import { sequenceS } from 'fp-ts/Apply'
import { AppError } from './types/errors'
import { AppConfig, readEnvironmentVariable, DiscordConfig, MongoConfig } from './types/config'
import { loginBot, setBotListener } from './bot'
import { cardSlashCommands } from './commands/card'
import { establishMongoConnection } from './plugins/mongo'
import { pipe } from 'fp-ts/lib/function'

// register commands
const commandList = [PingSlashCommand].concat(cardSlashCommands)

// Read .env file (if exist)
dotenv.config()

// read config
const discordConfig: E.Either<AppError, DiscordConfig> = pipe(
  {
    token: readEnvironmentVariable('TOKEN'),
    clientId: readEnvironmentVariable('CLIENT_ID'),
    guildId: readEnvironmentVariable('GUILD_ID')
  },
  sequenceS(E.Apply)
)

const mongoConfig: E.Either<AppError, MongoConfig> = pipe(
  {
    mongoConnectionString: readEnvironmentVariable('MONGO_CONNECTION_STRING')
  },
  sequenceS(E.Apply)
)

const appConfig: E.Either<AppError, AppConfig> = pipe(
  {
    discordConfig,
    mongoConfig
  },
  sequenceS(E.Apply)
)

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

pipe(
  appConfig,
  TE.fromEither,
  TE.chainFirstW(establishMongoConnection),
  TE.chainFirst(deploySlashCommands(commandList)),
  TE.chainFirst(loginBot(client)),
  TE.chain(() => TE.of(setBotListener(client)(commandList))),
  TE.match(
    (e) => console.log(`${e._tag}: ${e.msg}`),
    () => console.log('Deploy commands and login successfully!')
  )
)()
