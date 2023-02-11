import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js'
import { SlashCommand } from '../types/command'
import { pipe, flow, identity } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import * as TSP from 'ts-pattern'
import * as t from 'io-ts'
import * as lodash from 'lodash/fp'
import { ParameterError, mongoErrorOf, notFoundErrorOf, parameterNotFoundErrorOf } from '../errors'
import { stringDecoder, booleanDecoder, numberDecoder } from '../decoder'
import { CardInput, cardCategoryOf, cardDreamCategoryOf } from '../types/card'
import CardModel from '../models/card'
import { MongooseError } from 'mongoose'

const exampleObj: CardInput = {
  name: '貪狼',
  cost: 4,
  category: '感知',
  description:
    '你的出牌階段使用，對敵方單體目標造成4×【感知】值的傷害，然後你持有手牌中屬性為“感知”的牌(不含衍生牌)，效果都改為與“貪狼”相同直到這回合結束'
}

const getStringFieldFromCommandInteraction: (
  interaction: CommandInteraction
) => (fieldName: string) => E.Either<ParameterError, string> = (interaction) => (fieldName) =>
  pipe(
    E.tryCatch(
      () => interaction.options.get(fieldName, true),
      (e) => parameterNotFoundErrorOf(`${e}`)
    ),
    E.chainW((cache) => stringDecoder(fieldName)(cache.value))
  )

const getNumberFieldFromCommandInteraction: (
  interaction: CommandInteraction
) => (fieldName: string) => E.Either<ParameterError, number> = (interaction) => (fieldName) =>
  pipe(
    E.tryCatch(
      () => interaction.options.get(fieldName, true),
      (e) => parameterNotFoundErrorOf(`${e}`)
    ),
    E.chainW((cache) => numberDecoder(fieldName)(cache.value))
  )

const getWithDefaultStringFieldFromCommandInteraction: (
  interaction: CommandInteraction
) => (fieldName: string) => (defaultValue: string) => E.Either<ParameterError, string> =
  (interaction) => (fieldName) => (defaultValue) =>
    pipe(
      interaction.options.get(fieldName, false),
      O.fromNullable,
      O.map((cache) => stringDecoder(fieldName)(cache.value)),
      O.traverse(E.Applicative)(identity),
      E.map(O.match(() => defaultValue, identity))
    )

const getOptionalStringFieldFromCommandInteraction: (
  interaction: CommandInteraction
) => (fieldName: string) => E.Either<ParameterError, O.Option<string>> = (interaction) => (fieldName) =>
  pipe(
    interaction.options.get(fieldName, false),
    O.fromNullable,
    O.map((cache) => stringDecoder(fieldName)(cache.value)),
    O.traverse(E.Applicative)(identity)
  )

const getOptionalNumberFieldFromCommandInteraction: (
  interaction: CommandInteraction
) => (fieldName: string) => E.Either<ParameterError, O.Option<number>> = (interaction) => (fieldName) =>
  pipe(
    interaction.options.get(fieldName, false),
    O.fromNullable,
    O.map((cache) => numberDecoder(fieldName)(cache.value)),
    O.traverse(E.Applicative)(identity)
  )

const getOptionalBooleanFieldFromCommandInteraction: (
  interaction: CommandInteraction
) => (fieldName: string) => (defaultValue: boolean) => E.Either<ParameterError, boolean> =
  (interaction) => (fieldName) => (defaultValue) =>
    pipe(
      interaction.options.get(fieldName, false),
      O.fromNullable,
      O.map((cache) => booleanDecoder(fieldName)(cache.value)),
      O.traverse(E.Applicative)(identity),
      E.map(O.match(() => defaultValue, identity))
    )

const getCardSlashCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('get_card')
    .setDescription('Replies with the card information by given card name. (*) means required')
    .addStringOption((option) => option.setName('card_name').setDescription('(*) The card name you want to query')),
  async execute(interaction: CommandInteraction) {
    await pipe(
      getStringFieldFromCommandInteraction(interaction)('card_name'),
      TE.fromEither,
      TE.chainW((name) =>
        pipe(
          TE.tryCatch(
            () => CardModel.findOne({ name: name }).lean().exec(),
            (e) => mongoErrorOf((e as MongooseError).message)
          ),
          TE.chainW(TE.fromNullable(notFoundErrorOf(`Cannot find card with name: ${name}`)))
        )
      ),
      TE.map(lodash.pick(['name', 'cost', 'category', 'dream_category', 'description', 'createdTime', 'author'])),
      TE.match(
        (e) => interaction.reply(`${e._tag}: ${e.msg}`),
        (card) => interaction.reply(JSON.stringify(card, null, 2))
      )
    )()
  }
}

const getAllCardSlashCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('get_all_card')
    .setDescription('Replies with the card name of all cards in the database'),
  async execute(interaction: CommandInteraction) {
    await pipe(
      TE.tryCatch(
        () => CardModel.find().distinct<{ name: string }>('name').exec(),
        (e) => mongoErrorOf((e as MongooseError).message)
      ),
      TE.map((x) => x.join(', ')),
      TE.match(
        (e) => interaction.reply(`${e._tag}: ${e.msg}`),
        (card) => interaction.reply(card)
      )
    )()
  }
}

const postCardSlashCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('post_card')
    .setDescription('create a new card to the database. (*) means required')
    .addStringOption((option) =>
      option
        .setName('card_name')
        .setDescription('(*) The card name you want to save, should be unique for whole system')
    )
    .addIntegerOption((option) =>
      option.setName('cost').setDescription('(*) The cost of the card. Should be a integer. e.x. 0, 1, 6, -1')
    )
    .addStringOption((option) =>
      option
        .setName('category')
        .setDescription(
          '(*) The category of the card. Should be one of "體魄", "感知", "靈性", "社會", "衍生牌", "狀態牌"'
        )
    )
    .addStringOption((option) =>
      option
        .setName('dream_category')
        .setDescription('The card is a dream card or not. Should be one of "普通", "美夢", "惡夢", default is "普通"')
    )
    .addStringOption((option) =>
      option.setName('description').setDescription('The description of the card. Default is an empty string')
    ),
  async execute(interaction: CommandInteraction) {
    await pipe(
      E.Do,
      E.apS('name', getStringFieldFromCommandInteraction(interaction)('card_name')),
      E.apS('cost', getNumberFieldFromCommandInteraction(interaction)('cost')),
      E.apS('category', pipe(getStringFieldFromCommandInteraction(interaction)('category'), E.chainW(cardCategoryOf))),
      E.apS(
        'dream_category',
        pipe(
          getWithDefaultStringFieldFromCommandInteraction(interaction)('dream_category')('普通'),
          E.chainW(cardDreamCategoryOf)
        )
      ),
      E.apS('description', getWithDefaultStringFieldFromCommandInteraction(interaction)('description')('')),
      E.apS('author', E.right(interaction.user.username)),
      E.apS('createdTime', E.right(new Date().toLocaleString('zh'))),
      E.bind('updatedTime', ({ createdTime }) => E.right(createdTime)),
      TE.fromEither,
      TE.chainW((card) =>
        TE.tryCatch(
          () => CardModel.create(card),
          (e) => mongoErrorOf((e as MongooseError).message)
        )
      ),
      TE.map(lodash.pick(['name', 'cost', 'category', 'dream_category', 'description', 'createdTime', 'author'])),
      TE.match(
        (e) => interaction.reply(`${e._tag}: ${e.msg}`),
        (card) => interaction.reply(JSON.stringify(card, null, 2))
      )
    )()
  }
}

const putCardSlashCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('update_card')
    .setDescription('update a new card to the database. (*) means required')
    .addStringOption((option) =>
      option
        .setName('card_name')
        .setDescription('(*) The card name you want to update, should have been restored in the database')
    )
    .addIntegerOption((option) =>
      option.setName('cost').setDescription('The cost of the card. Should be a integer. e.x. 0, 1, 6, -1')
    )
    .addStringOption((option) =>
      option
        .setName('category')
        .setDescription('The category of the card. Should be one of "體魄", "感知", "靈性", "社會", "衍生牌", "狀態牌"')
    )
    .addStringOption((option) =>
      option
        .setName('dream_category')
        .setDescription('The card is a dream card or not. Should be one of "普通", "美夢", "惡夢", default is "普通"')
    )
    .addStringOption((option) =>
      option.setName('description').setDescription('The description of the card. Default is an empty string')
    ),
  async execute(interaction: CommandInteraction) {
    await pipe(
      E.Do,
      E.apS('name', getStringFieldFromCommandInteraction(interaction)('card_name')),
      E.apS(
        'cost',
        pipe(
          getOptionalNumberFieldFromCommandInteraction(interaction)('cost'),
          E.map(O.match(() => undefined, identity))
        )
      ),
      E.apS(
        'category',
        pipe(
          getOptionalStringFieldFromCommandInteraction(interaction)('category'),
          E.chainW(flow(O.map(cardCategoryOf), O.traverse(E.Applicative)(identity))),
          E.map(O.match(() => undefined, identity))
        )
      ),
      E.apS(
        'dream_category',
        pipe(
          getOptionalStringFieldFromCommandInteraction(interaction)('dream_category'),
          E.chainW(flow(O.map(cardDreamCategoryOf), O.traverse(E.Applicative)(identity))),
          E.map(O.match(() => undefined, identity))
        )
      ),
      E.apS(
        'description',
        pipe(
          getOptionalStringFieldFromCommandInteraction(interaction)('description'),
          E.map(O.match(() => undefined, identity))
        )
      ),
      E.apS('author', E.right(interaction.user.username)),
      E.apS('updatedTime', E.right(new Date().toLocaleString('zh'))),
      TE.fromEither,
      TE.chainW((card) =>
        pipe(
          TE.tryCatch(
            () => CardModel.findOneAndUpdate({ name: card.name }, card, { new: true }).exec(),
            (e) => mongoErrorOf((e as MongooseError).message)
          ),
          TE.chainW(TE.fromNullable(notFoundErrorOf(`Cannot find card with name: ${card.name}`)))
        )
      ),
      TE.map(
        lodash.pick([
          'name',
          'cost',
          'category',
          'dream_category',
          'description',
          'createdTime',
          'updatedTime',
          'author'
        ])
      ),
      TE.match(
        (e) => interaction.reply(`${e._tag}: ${e.msg}`),
        (card) => interaction.reply(JSON.stringify(card, null, 2))
      )
    )()
  }
}

const playCardSlashCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('play_card')
    .setDescription('Generate play card message by given card name. (*) means required')
    .addStringOption((option) => option.setName('card_name').setDescription('(*) The card name you want to query'))
    .addIntegerOption((option) => option.setName('curr_mana').setDescription('Current mana of the player'))
    .addStringOption((option) => option.setName('player').setDescription('The name of the player'))
    .addStringOption((option) => option.setName('target').setDescription('The target of the card'))
    .addStringOption((option) => option.setName('supplementary').setDescription('The supplementary information.')),
  async execute(interaction: CommandInteraction) {
    const playerMsg: string = pipe(
      interaction.options.get('player', false),
      (x) => x?.value,
      O.fromNullable,
      O.match(
        () => ``,
        (p) => `${p}\t`
      )
    )

    const targetMsg: string = pipe(
      interaction.options.get('target', false),
      (x) => x?.value,
      O.fromNullable,
      O.match(
        () => ``,
        (tg) => `目標：${tg}\t`
      )
    )

    const mana: O.Option<number> = pipe(
      interaction.options.get('curr_mana', false),
      (x) => x?.value,
      O.fromNullable,
      O.map((x) => x as unknown as number)
    )

    const supplementary: O.Option<string> = pipe(
      interaction.options.get('supplementary', false),
      (x) => x?.value,
      O.fromNullable,
      O.map((x) => x as unknown as string)
    )

    await pipe(
      getStringFieldFromCommandInteraction(interaction)('card_name'),
      TE.fromEither,
      TE.chainW((name) =>
        pipe(
          TE.tryCatch(
            () => CardModel.findOne({ name: name }).lean().exec(),
            (e) => mongoErrorOf((e as MongooseError).message)
          ),
          TE.chainW(TE.fromNullable(notFoundErrorOf(`Cannot find card with name: ${name}`)))
        )
      ),
      TE.map(
        (card) =>
          `${playerMsg}出牌：${card.name}\t${targetMsg}\t${O.match(
            () => ``,
            (m: number) => `MANA：${m} -> ${m - card.cost}`
          )(mana)}\n效果：${card.description}\n${O.match(
            () => ``,
            (sup) => `補充敘述：${sup}`
          )(supplementary)}`
      ),
      TE.match(
        (e) => interaction.reply(`${e._tag}: ${e.msg}`),
        (playMsg) => interaction.reply(playMsg)
      )
    )()
  }
}

const testEmbed: SlashCommand = {
  data: new SlashCommandBuilder().setName('test_embed').setDescription('no desc'),
  async execute(interaction: CommandInteraction) {
    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle('some title').setDescription('some desc')]
    })
  }
}

export const cardSlashCommands = [
  getCardSlashCommand,
  getAllCardSlashCommand,
  postCardSlashCommand,
  putCardSlashCommand,
  playCardSlashCommand,
  testEmbed
]
