import { DiscordAPIError, REST, Routes } from 'discord.js'
import { AppConfig } from './types/config'
import { SlashCommand } from './types/command'
import { DeployCommandsResponse } from './types/response'
import * as TE from 'fp-ts/lib/TaskEither'
import { AppError, botDeployErrorOf } from './types/errors'

export const deploySlashCommands: (
  commandList: Array<SlashCommand>
) => (appConfig: AppConfig) => TE.TaskEither<AppError, DeployCommandsResponse> = (commandList) => (appConfig) => {
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
