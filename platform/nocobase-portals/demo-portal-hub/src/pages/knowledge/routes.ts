const enc = (id: string | number) => encodeURIComponent(String(id));

export const knowledgeRoutes = {
  overview: "/kb-overview",
  articles: "/articles",
  articlesCreate: "/articles/create",
  articlesEdit: "/articles/edit/:id",
  articlesShow: "/articles/show/:id",
  articlesFeedback: "/articles/show/:id/feedback",
  categories: "/categories",
  categoriesCreate: "/categories/create",
  categoriesEdit: "/categories/edit/:id",
  categoriesShow: "/categories/show/:id",
  search: "/kb-search",
  tags: "/kb-tags",
} as const;

export const getArticleShowPath = (id: string | number) =>
  `/articles/show/${enc(id)}`;
export const getArticleEditPath = (id: string | number) =>
  `/articles/edit/${enc(id)}`;
export const getCategoryEditPath = (id: string | number) =>
  `/categories/edit/${enc(id)}`;
export const getCategoryShowPath = (id: string | number) =>
  `/categories/show/${enc(id)}`;
