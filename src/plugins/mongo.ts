import mongoose from 'mongoose'
import * as TE from 'fp-ts/TaskEither'
import { MongoConnectError, mongoConnectErrorOf } from '../types/errors'
import { AppConfig } from '../types/config'

export const establishMongoConnection: (appConfig: AppConfig) => TE.TaskEither<MongoConnectError, typeof mongoose> = (
  appConfig
) =>
  TE.tryCatch(
    () => mongoose.connect(appConfig.mongoConfig.mongoConnectionString),
    (e) => mongoConnectErrorOf(`connect to db error: ${e}`)
  )
