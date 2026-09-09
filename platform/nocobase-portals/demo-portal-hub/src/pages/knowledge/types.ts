export type CategoryRecord = {
  id: string | number;
  name?: string;
  description?: string | null;
  parent_id?: string | number | null;
  parent?: CategoryRecord | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CategoryFormValues = {
  name: string;
  description: string;
  parent_id: string | null;
};

export type UserRef = {
  id: string | number;
  nickname?: string | null;
};

export type ArticleRecord = {
  id: string | number;
  title?: string;
  summary?: string | null;
  body?: string | null;
  status?: string | null;
  views?: number | null;
  category_id?: string | number | null;
  category?: CategoryRecord | null;
  author_id?: string | number | null;
  author?: UserRef | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ArticleFormValues = {
  title: string;
  summary: string;
  body: string;
  status: string;
  category_id: string | null;
  author_id: string | null;
};

/** A category plus the ids that fall under it (itself + all descendants). */
export type CategoryNode = CategoryRecord & {
  children: CategoryNode[];
  descendantIds: string[];
  articleCount: number;
};

export type FeedbackRecord = {
  id: string | number;
  article_id?: string | number | null;
  article?: ArticleRecord | null;
  rating?: string | null;
  comment?: string | null;
  author_id?: string | number | null;
  author?: UserRef | null;
  createdAt?: string;
};

export type FeedbackFormValues = {
  rating: string;
  comment: string;
};
