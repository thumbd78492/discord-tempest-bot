import { DiscordAPIError, REST, Routes } from 'discord.js'
import { AppConfig } from './config'
import { SlashCommand } from './types/command'
import { DeployCommandsResponse } from './types/response'
import * as TE from 'fp-ts/TaskEither'
import { botDeployErrorOf, AppError } from './errors'

export const deploySlashCommands: (
  appConfig: AppConfig
) => (commandList: Array<SlashCommand>) => TE.TaskEither<AppError, DeployCommandsResponse> =
  (appConfig) => (commandList) => {
    const rest = new REST({ version: '10' }).setToken(appConfig.discordConfig.token)
    const putPayload = commandList.map((c) => c.data.toJSON())

    return TE.tryCatch(
      () =>
        rest.put(Routes.applicationGuildCommands(appConfig.discordConfig.clientId, appConfig.discordConfig.guildId), {
          body: putPayload
        }) as Promise<DeployCommandsResponse>,
      (r) => botDeployErrorOf(`Deploy Commands Failed: ${(r as DiscordAPIError).message}`)
    )
  }
