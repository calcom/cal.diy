export type UserTableUser = {
  id: number;
  name: string | null;
  username: string | null;
  email: string;
  role: string;
  timeZone: string;
  bio: string | null;
  avatarUrl: string | null;
  accepted: boolean;
  completedOnboarding: boolean;
  status?: "ACTIVE" | "PAUSED";
  membershipId?: number;
  lastActiveAt: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  customRole?: { name: string } | null;
  twoFactorEnabled?: boolean;
  teams: { id: number; name: string; slug: string | null }[];
  attributes: {
    attributeId: string;
    value: string;
    weight?: number;
    contains?: string[];
  }[];
};

export type PlatformManagedUserTableUser = Omit<
  UserTableUser,
  "lastActiveAt" | "attributes" | "completedOnboarding"
>;

export type UserTablePayload = {
  showModal: boolean;
  user?: UserTableUser;
};

export type UserTableState = {
  changeMemberRole: UserTablePayload;
  deleteMember: UserTablePayload;
  impersonateMember: UserTablePayload;
  inviteMember: UserTablePayload;
  editSheet: UserTablePayload & { user?: UserTableUser };
};

export type UserTableAction =
  | {
      type:
        | "SET_CHANGE_MEMBER_ROLE_ID"
        | "SET_DELETE_ID"
        | "SET_IMPERSONATE_ID"
        | "INVITE_MEMBER"
        | "EDIT_USER_SHEET"
        | "INVITE_MEMBER";
      payload: UserTablePayload;
    }
  | {
      type: "CLOSE_MODAL";
    };
