import { pointerWithin, rectIntersection, type CollisionDetection } from "@dnd-kit/core";

export const plannerCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
};
