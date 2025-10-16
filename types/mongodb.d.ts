declare module 'mongodb' {
  export type Document = Record<string, unknown>;
  export type Filter = Record<string, unknown>;
  export type UpdateFilter = Record<string, unknown>;

  export class ObjectId {
    constructor(id?: string);
    toString(): string;
  }

  export interface FindCursor<TSchema extends Document = Document> {
    sort(sort: Record<string, 1 | -1>): FindCursor<TSchema>;
    toArray(): Promise<TSchema[]>;
  }

  export interface Collection<TSchema extends Document = Document> {
    find(filter: Filter): FindCursor<TSchema>;
    findOne(filter: Filter): Promise<TSchema | null>;
    findOneAndUpdate(
      filter: Filter,
      update: UpdateFilter,
      options?: { returnDocument?: 'before' | 'after'; upsert?: boolean }
    ): Promise<{ value: TSchema | null }>;
    insertOne(doc: TSchema): Promise<{ insertedId: ObjectId }>;
    updateOne(filter: Filter, update: UpdateFilter): Promise<unknown>;
    deleteOne(filter: Filter): Promise<{ deletedCount?: number }>;
    deleteMany(filter: Filter): Promise<{ deletedCount?: number }>;
    createIndex(indexSpec: Record<string, 1 | -1>): Promise<string>;
  }

  export interface Db {
    collection<TSchema extends Document = Document>(name: string): Collection<TSchema>;
  }

  export class MongoClient {
    constructor(uri: string, options?: Record<string, unknown>);
    connect(): Promise<MongoClient>;
    db(name: string): Db;
  }
}
