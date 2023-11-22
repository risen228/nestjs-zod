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
    cuid: z.string().cuid(),
    cuid2: z.string().cuid2(),
    ulid: z.string().ulid(),
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

it('should serialize a complex schema', () => {
  const openApiObject = zodToOpenAPI(complexTestSchema)

  expect(openApiObject).toMatchSnapshot()
})

it('should serialize an intersection of objects', () => {
  const openApiObject = zodToOpenAPI(intersectedObjectsSchema)

  expect(openApiObject).toMatchSnapshot()
})

it('should serialize an intersection of unions', () => {
  const openApiObject = zodToOpenAPI(intersectedUnionsSchema)

  expect(openApiObject).toMatchSnapshot()
})

it('should serialize an intersection with overrided fields', () => {
  const openApiObject = zodToOpenAPI(overrideIntersectionSchema)

  expect(openApiObject).toMatchSnapshot()
})

it('should serialize objects', () => {
  const schema = z.object({
    prop1: z.string(),
    prop2: z.string().optional(),
  })
  const openApiObject = zodToOpenAPI(schema)

  expect(openApiObject).toEqual({
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
})

it('should serialize partial objects', () => {
  const schema = z
    .object({
      prop1: z.string(),
      prop2: z.string(),
    })
    .partial()
  const openApiObject = zodToOpenAPI(schema)

  expect(openApiObject).toEqual({
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
})

it('should serialize nullable types', () => {
  const schema = z.string().nullable()
  const openApiObject = zodToOpenAPI(schema)

  expect(openApiObject).toEqual({ type: 'string', nullable: true })
})

it('should serialize optional types', () => {
  const schema = z.string().optional()
  const openApiObject = zodToOpenAPI(schema)

  expect(openApiObject).toEqual({ type: 'string' })
})

it('should serialize types with default value', () => {
  const schema = z.string().default('abitia')
  const openApiObject = zodToOpenAPI(schema)

  expect(openApiObject).toEqual({ type: 'string', default: 'abitia' })
})

it('should serialize enums', () => {
  const schema = z.enum(['adama', 'kota'])
  const openApiObject = zodToOpenAPI(schema)

  expect(openApiObject).toEqual({
    type: 'string',
    enum: ['adama', 'kota'],
  })
})

it('should serialize native enums', () => {
  enum NativeEnum {
    ADAMA = 'adama',
    KOTA = 'kota',
  }

  const schema = z.nativeEnum(NativeEnum)
  const openApiObject = zodToOpenAPI(schema)

  expect(openApiObject).toEqual({
    'type': 'string',
    'enum': ['adama', 'kota'],
    'x-enumNames': ['ADAMA', 'KOTA'],
  })
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
      const openApiObject = zodToOpenAPI(zodType)

      expect(openApiObject).toEqual({
        type: expectedType,
        format: expectedFormat ?? undefined,
      })
    })
  }
})

it('should serialize transformed schema', () => {
  const openApiObject = zodToOpenAPI(transformedSchema)

  expect(openApiObject).toEqual({
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
  const openApiObject = zodToOpenAPI(lazySchema)

  expect(openApiObject).toEqual({
    type: 'string',
  })
})
