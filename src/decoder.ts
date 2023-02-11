import * as t from 'io-ts'
import * as E from 'fp-ts/Either'
import { InvalidParameterError, invalidParameterErrorOf } from './errors'
import { flow } from 'fp-ts/lib/function'

export const stringDecoder: (fieldName: string) => (s: unknown) => E.Either<InvalidParameterError, string> = (
  fieldName
) =>
  flow(
    t.string.decode,
    E.mapLeft((_) => invalidParameterErrorOf(`${fieldName} is not a string!`))
  )

export const numberDecoder: (fieldName: string) => (s: unknown) => E.Either<InvalidParameterError, number> = (
  fieldName
) =>
  flow(
    t.number.decode,
    E.mapLeft((_) => invalidParameterErrorOf(`${fieldName} is not a number!`))
  )

export const booleanDecoder: (fieldName: string) => (s: unknown) => E.Either<InvalidParameterError, boolean> = (
  fieldName
) =>
  flow(
    t.boolean.decode,
    E.mapLeft((_) => invalidParameterErrorOf(`${fieldName} is not a boolean!`))
  )
