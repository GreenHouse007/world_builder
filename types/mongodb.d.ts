declare module 'mongodb' {
  export type Document = Record<string, unknown>;

  export type Filter<TSchema> = Partial<{ [K in keyof TSchema]: TSchema[K] }>;
  export type UpdateFilter<TSchema> = {
    $set?: Partial<TSchema>;
    $setOnInsert?: Partial<TSchema>;
  };

  export interface FindCursor<TSchema> {
    sort(sort: Record<string, 1 | -1>): FindCursor<TSchema>;
    toArray(): Promise<TSchema[]>;
  }

  export interface DeleteResult {
    deletedCount?: number;
  }

  export interface Collection<TSchema = Document> {
    find(filter: Filter<TSchema>): FindCursor<TSchema>;
    findOne(filter: Filter<TSchema>): Promise<TSchema | null>;
    findOneAndUpdate(
      filter: Filter<TSchema>,
      update: UpdateFilter<TSchema>,
      options?: { returnDocument?: 'before' | 'after'; upsert?: boolean },
    ): Promise<{ value: TSchema | null }>;
    insertOne(doc: TSchema): Promise<{ insertedId: string }>;
    updateOne(filter: Filter<TSchema>, update: UpdateFilter<TSchema>): Promise<unknown>;
    deleteOne(filter: Filter<TSchema>): Promise<DeleteResult>;
    deleteMany(filter: Filter<TSchema>): Promise<DeleteResult>;
    createIndex(indexSpec: Record<string, 1 | -1>): Promise<string>;
  }

  export interface Db {
    collection<TSchema = Document>(name: string): Collection<TSchema>;
  }

  export class MongoClient {
    constructor(uri: string, options?: Record<string, unknown>);
    connect(): Promise<MongoClient>;
    db(dbName?: string): Db;
  }

  export class ObjectId {
    constructor(id?: string);
    toString(): string;
  }
}
