/**
 * How the world is drawn: screen px per world unit. A ball is 10 world units, so at 0.16 it is ~1.6 px in radius on
 * screen and the window shows ~6.3× more world in each direction (≈ 39× the area) than at 1.0 (it was 0.32 before).
 * Smaller = smaller balls and more room. The physics does not depend on it (everything is in world units), so speeds
 * look proportionally slower on screen the further out you zoom.
 */
export const VIEW_ZOOM = 0.16
