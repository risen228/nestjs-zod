import crypto from 'crypto'
import { createMock } from '@golevelup/ts-jest'
import { z, ZodTypeAny } from '../z'
import { zodToOpenAPI } from './zod-to-openapi'

const complexTestSchema = z.object({
  stringMinMax: z.string().min(5).max(15),
  numberMinMax: z.number().min(3).max(10),
  numberMultipleOf: z.number().multipleOf(10),
  enumDefault: z.enum(['buy-it-now', 'auctions']).default('buy-it-now'),
  tuple: z.tuple([
    z.string(),
    z.object({ name: z.literal('Rudy') }),
    z.array(z.union([z.literal('blue'), z.literal('red')])),
  ]),
  union: z
    .union([z.literal('kek'), z.literal('topkek')])
    .describe('Please choose topkek'),
  discriminatedUnion: z.discriminatedUnion('name', [
    z.object({ name: z.literal('vasya'), age: z.number() }),
    z.object({ name: z.literal('petya'), age: z.number() }),
  ]),
  literalString: z.literal('123'),
  literalNumber: z.literal(123),
  literalBoolean: z.literal(true),
  array: z.array(z.string()).max(3),
  objectNested: z.object({
    uuid: z.string().uuid(),
  }),
  record: z.record(z.number()),
  recordWithKeys: z.record(z.number(), z.string()),
  dateString: z.dateString().cast().describe('My date string'),
  zodDateString: z.string().datetime(),
  password: z.password(),
  passwordComplex: z
    .password()
    .atLeastOne('digit')
    .atLeastOne('uppercase')
    .min(8)
    .max(100),
})

const intersectedObjectsSchema = z.intersection(
  z.object({
    one: z.number(),
  }),
  z.object({
    two: z.number(),
  })
)

const intersectedUnionsSchema = z.intersection(
  z.union([z.literal('123'), z.number()]),
  z.union([z.boolean(), z.array(z.string())])
)

const overrideIntersectionSchema = z.intersection(
  z.object({
    one: z.number(),
  }),
  z.object({
    one: z.string(),
  })
)

const transformedSchema = z
  .object({
    seconds: z.number(),
  })
  .transform((value) => ({
    seconds: value.seconds,
    minutes: value.seconds / 60,
    hours: value.seconds / 3600,
  }))

const lazySchema = z.lazy(() => z.string())

const rootRecursiveSchema = z.lazy(() => z.union([rootNodeScheme, z.string()]))

const rootNodeScheme: z.ZodType<{ text: string }> = z.object({
  text: z.string(),
  children: z.array(rootRecursiveSchema),
})

const nestedNodeScheme: z.ZodType<{ text: string }> = z.object({
  text: z.string(),
  root: rootRecursiveSchema,
  children: z.array(z.lazy(() => nestedRecursiveSchema)),
})

const nestedRecursiveSchema = z.union([nestedNodeScheme, z.string()])

it('should serialize a complex schema', () => {
  const { refs, schema } = zodToOpenAPI(complexTestSchema)

  expect(schema).toMatchSnapshot()
  expect(refs).toEqual({})
})

it('should serialize an intersection of objects', () => {
  const { refs, schema } = zodToOpenAPI(intersectedObjectsSchema)

  expect(schema).toMatchSnapshot()
  expect(refs).toEqual({})
})

it('should serialize an intersection of unions', () => {
  const { refs, schema } = zodToOpenAPI(intersectedUnionsSchema)

  expect(schema).toMatchSnapshot()
  expect(refs).toEqual({})
})

it('should serialize an intersection with overrided fields', () => {
  const { refs, schema } = zodToOpenAPI(overrideIntersectionSchema)

  expect(schema).toMatchSnapshot()
  expect(refs).toEqual({})
})

it('should serialize objects', () => {
  const dto = z.object({
    prop1: z.string(),
    prop2: z.string().optional(),
  })
  const { refs, schema } = zodToOpenAPI(dto)

  expect(schema).toEqual({
    type: 'object',
    required: ['prop1'],
    properties: {
      prop1: {
        type: 'string',
      },
      prop2: {
        type: 'string',
      },
    },
  })
  expect(refs).toEqual({})
})

it('should serialize partial objects', () => {
  const dto = z
    .object({
      prop1: z.string(),
      prop2: z.string(),
    })
    .partial()
  const { refs, schema } = zodToOpenAPI(dto)

  expect(schema).toEqual({
    type: 'object',
    properties: {
      prop1: {
        type: 'string',
      },
      prop2: {
        type: 'string',
      },
    },
  })
  expect(refs).toEqual({})
})

it('should serialize nullable types', () => {
  const dto = z.string().nullable()
  const { refs, schema } = zodToOpenAPI(dto)

  expect(schema).toEqual({ type: 'string', nullable: true })
  expect(refs).toEqual({})
})

it('should serialize optional types', () => {
  const dto = z.string().optional()
  const { refs, schema } = zodToOpenAPI(dto)

  expect(schema).toEqual({ type: 'string' })
  expect(refs).toEqual({})
})

it('should serialize types with default value', () => {
  const dto = z.string().default('abitia')
  const { refs, schema } = zodToOpenAPI(dto)

  expect(schema).toEqual({ type: 'string', default: 'abitia' })
  expect(refs).toEqual({})
})

it('should serialize enums', () => {
  const dto = z.enum(['adama', 'kota'])
  const { refs, schema } = zodToOpenAPI(dto)

  expect(schema).toEqual({
    type: 'string',
    enum: ['adama', 'kota'],
  })
  expect(refs).toEqual({})
})

it('should serialize native enums', () => {
  enum NativeEnum {
    ADAMA = 'adama',
    KOTA = 'kota',
  }

  const dto = z.nativeEnum(NativeEnum)
  const { refs, schema } = zodToOpenAPI(dto)

  expect(schema).toEqual({
    'type': 'string',
    'enum': ['adama', 'kota'],
    'x-enumNames': ['ADAMA', 'KOTA'],
  })
  expect(refs).toEqual({})
})

describe('scalar types', () => {
  const testCases: [ZodTypeAny, string, string?][] = [
    // [zod type, expected open api type, expected format]
    [z.string(), 'string'],
    [z.number(), 'number'],
    [z.boolean(), 'boolean'],
    [z.bigint(), 'integer', 'int64'],
    // [z.null(), 'null'], <- Needs OpenApi 3.1 to be represented correctly
    // [z.undefined(), 'undefined'], <- TBD, probably the property should be removed from schema
  ]

  for (const [zodType, expectedType, expectedFormat] of testCases) {
    // eslint-disable-next-line no-loop-func
    it(expectedType, () => {
      const { refs, schema } = zodToOpenAPI(zodType)

      expect(schema).toEqual({
        type: expectedType,
        format: expectedFormat ?? undefined,
      })
      expect(refs).toEqual({})
    })
  }
})

it('should serialize transformed schema', () => {
  const { refs, schema } = zodToOpenAPI(transformedSchema)

  expect(schema).toEqual({
    type: 'object',
    required: ['seconds'],
    properties: {
      seconds: {
        type: 'number',
      },
    },
  })
})

it('should serialize lazy schema', () => {
  const { refs, schema } = zodToOpenAPI(lazySchema)

  expect(schema).toEqual({
    type: 'string',
  })
  expect(refs).toEqual({})
})

it('should serialize root recursive schema', () => {
  const id = '6d7efd287e'

  jest
    .spyOn(crypto, 'randomBytes')
    .mockImplementation(() => ({ toString: () => id }))

  const { refs, schema } = zodToOpenAPI(rootRecursiveSchema)

  expect(schema).toEqual({
    $ref: `#/components/schemas/ZodLazy${id}`,
  })
  expect(refs).toMatchSnapshot()
})

it('should serialize nested recursive schema', () => {
  let i = 0

  jest
    .spyOn(crypto, 'randomBytes')
    .mockImplementation(() => ({ toString: () => i++ }))

  const { refs, schema } = zodToOpenAPI(nestedRecursiveSchema)

  expect(schema).toMatchSnapshot()
  expect(refs).toMatchSnapshot()
})
