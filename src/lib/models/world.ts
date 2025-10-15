export interface World {
  _id?: string;
  ownerId: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}
