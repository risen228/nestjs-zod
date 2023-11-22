import { Type } from '@nestjs/common'
import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface'
import mergeDeep from 'merge-deep'
import { z } from '../z'

interface ExtendedSchemaObject extends SchemaObject {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: `x-${string}`]: any
}

export function is<T extends Type<z.ZodTypeAny>>(
  input: z.ZodTypeAny,
  factory: T
): input is InstanceType<T> {
  const factories = z as unknown as Record<string, Type<z.ZodTypeAny>>
  return factory === factories[input._def.typeName]
}

export function zodToOpenAPI(
  zodType: z.ZodTypeAny,
  visited: Set<any> = new Set()
) {
  const object: ExtendedSchemaObject = {}

  if (zodType.description) {
    object.description = zodType.description
  }

  if (is(zodType, z.ZodString)) {
    const { checks } = zodType._def
    object.type = 'string'

    for (const check of checks) {
      if (check.kind === 'min') {
        object.minLength = check.value
      } else if (check.kind === 'max') {
        object.maxLength = check.value
      } else if (check.kind === 'email') {
        object.format = 'email'
      } else if (check.kind === 'url') {
        object.format = 'uri'
      } else if (check.kind === 'uuid') {
        object.format = 'uuid'
      } else if (check.kind === 'ulid') {
        object.format = 'ulid'
      } else if (check.kind === 'cuid') {
        object.format = 'cuid'
      } else if (check.kind === 'cuid2') {
        object.format = 'cuid2'
      } else if (check.kind === 'regex') {
        object.pattern = check.regex.source
      } else if (check.kind === 'datetime') {
        object.format = 'date-time'
      }
    }
  }

  if (is(zodType, z.ZodPassword)) {
    const { checks } = zodType._def
    const regex = zodType.buildFullRegExp()
    object.type = 'string'
    object.format = 'password'
    object.pattern = regex.source

    for (const check of checks) {
      if (check.kind === 'minLength') {
        object.minLength = check.value
      } else if (check.kind === 'maxLength') {
        object.maxLength = check.value
      }
    }
  }

  if (is(zodType, z.ZodBoolean)) {
    object.type = 'boolean'
  }

  if (is(zodType, z.ZodNumber)) {
    const { checks } = zodType._def
    object.type = 'number'

    for (const check of checks) {
      if (check.kind === 'int') {
        object.type = 'integer'
      } else if (check.kind === 'min') {
        object.minimum = check.value
        object.exclusiveMinimum = !check.inclusive
      } else if (check.kind === 'max') {
        object.maximum = check.value
        object.exclusiveMaximum = !check.inclusive
      } else if (check.kind === 'multipleOf') {
        object.multipleOf = check.value
      }
    }
  }

  if (is(zodType, z.ZodDateString)) {
    const { checks } = zodType._def
    object.type = 'string'

    for (const check of checks) {
      if (check.kind === 'format') {
        object.format = check.value
      }
    }
  }

  if (is(zodType, z.ZodBigInt)) {
    object.type = 'integer'
    object.format = 'int64'
  }

  if (is(zodType, z.ZodArray)) {
    const { minLength, maxLength, type } = zodType._def
    object.type = 'array'
    if (minLength) object.minItems = minLength.value
    if (maxLength) object.maxItems = maxLength.value
    object.items = zodToOpenAPI(type, visited)
  }

  if (is(zodType, z.ZodTuple)) {
    const { items } = zodType._def
    object.type = 'array'
    object.items = { oneOf: items.map((item) => zodToOpenAPI(item, visited)) }
  }

  if (is(zodType, z.ZodSet)) {
    const { valueType, minSize, maxSize } = zodType._def
    object.type = 'array'
    if (minSize) object.minItems = minSize.value
    if (maxSize) object.maxItems = maxSize.value
    object.items = zodToOpenAPI(valueType, visited)
    object.uniqueItems = true
  }

  if (is(zodType, z.ZodUnion)) {
    const { options } = zodType._def
    object.oneOf = options.map((option) => zodToOpenAPI(option, visited))
  }

  if (is(zodType, z.ZodDiscriminatedUnion)) {
    const { options } = zodType._def
    object.oneOf = []
    for (const schema of options.values()) {
      object.oneOf.push(zodToOpenAPI(schema, visited))
    }
  }

  if (is(zodType, z.ZodLiteral)) {
    const { value } = zodType._def

    if (typeof value === 'string') {
      object.type = 'string'
      object.enum = [value]
    }

    if (typeof value === 'number') {
      object.type = 'number'
      object.minimum = value
      object.maximum = value
    }

    if (typeof value === 'boolean') {
      // currently there is no way to completely describe boolean literal
      object.type = 'boolean'
    }
  }

  if (is(zodType, z.ZodEnum)) {
    const { values } = zodType._def
    object.type = 'string'
    object.enum = values
  }

  if (is(zodType, z.ZodNativeEnum)) {
    const { values } = zodType._def
    // this only supports enums with string literal values
    object.type = 'string'
    object.enum = Object.values(values)
    object['x-enumNames'] = Object.keys(values)
  }

  if (is(zodType, z.ZodTransformer)) {
    const { schema } = zodType._def
    Object.assign(object, zodToOpenAPI(schema, visited))
  }

  if (is(zodType, z.ZodNullable)) {
    const { innerType } = zodType._def
    Object.assign(object, zodToOpenAPI(innerType, visited))
    object.nullable = true
  }

  if (is(zodType, z.ZodOptional)) {
    const { innerType } = zodType._def
    Object.assign(object, zodToOpenAPI(innerType, visited))
  }

  if (is(zodType, z.ZodDefault)) {
    const { defaultValue, innerType } = zodType._def
    Object.assign(object, zodToOpenAPI(innerType, visited))
    object.default = defaultValue()
  }

  if (is(zodType, z.ZodObject)) {
    const { shape } = zodType._def
    object.type = 'object'

    object.properties = {}
    object.required = []

    for (const [key, schema] of Object.entries<z.ZodTypeAny>(shape())) {
      object.properties[key] = zodToOpenAPI(schema, visited)
      const optionalTypes = [z.ZodOptional.name, z.ZodDefault.name]
      const isOptional = optionalTypes.includes(schema.constructor.name)
      if (!isOptional) object.required.push(key)
    }

    if (object.required.length === 0) {
      delete object.required
    }
  }

  if (is(zodType, z.ZodRecord)) {
    const { valueType } = zodType._def
    object.type = 'object'
    object.additionalProperties = zodToOpenAPI(valueType, visited)
  }

  if (is(zodType, z.ZodIntersection)) {
    const { left, right } = zodType._def
    const merged = mergeDeep(
      zodToOpenAPI(left, visited),
      zodToOpenAPI(right, visited)
    )
    Object.assign(object, merged)
  }

  if (is(zodType, z.ZodEffects)) {
    const { schema } = zodType._def
    Object.assign(object, zodToOpenAPI(schema, visited))
  }

  if (is(zodType, z.ZodLazy)) {
    const { getter } = zodType._def
    if (visited.has(getter)) return object

    visited.add(getter)
    Object.assign(object, zodToOpenAPI(getter(), visited))
  }

  return object
}
