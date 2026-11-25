import { prisma } from "../config/prisma";

/** BFS down the parentId chain to collect every descendant user id (all levels, not just direct children). */
export async function getDescendantUserIds(rootUserId: string): Promise<string[]> {
  const allIds: string[] = [];
  let frontier = [rootUserId];

  while (frontier.length > 0) {
    const children = await prisma.user.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    const childIds = children.map((c) => c.id);
    allIds.push(...childIds);
    frontier = childIds;
  }

  return allIds;
}
