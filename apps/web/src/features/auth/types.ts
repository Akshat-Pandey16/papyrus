export type AuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
};

export type AuthOrganization = {
  id: string;
  name: string;
  slug: string;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
};

export type AuthSession = {
  user: AuthUser;
  organization: AuthOrganization;
  tokens: TokenPair;
};
