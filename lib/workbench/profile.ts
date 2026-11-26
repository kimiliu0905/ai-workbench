import { prisma } from "@/lib/db/prisma";
import { defaultProfile, profileSchema, type UserProfile } from "@/lib/profile";

export async function getWorkbenchProfile(): Promise<UserProfile> {
  const row = await prisma.userProfile.findUnique({ where: { id: "default" } });
  if (!row) return defaultProfile;
  const parsed = profileSchema.safeParse({ name: row.name, username: row.username, avatar: row.avatar });
  return parsed.success ? parsed.data : defaultProfile;
}

export async function saveWorkbenchProfile(input: unknown): Promise<UserProfile> {
  const valid = profileSchema.parse(input);
  await prisma.userProfile.upsert({
    where: { id: "default" },
    create: { id: "default", name: valid.name, username: valid.username, avatar: valid.avatar },
    update: { name: valid.name, username: valid.username, avatar: valid.avatar },
  });
  return valid;
}
