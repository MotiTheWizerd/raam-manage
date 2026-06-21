/**
 * Shared types for the cars / SLPR server actions. Pure type declarations — no
 * runtime code — so any module (server or client) can import them freely.
 */

export type RecognizedGuest = {
  id: number;
  guestName: string | null;
  residentId: number | null;
  apartmentId: number | null;
  residentName: string | null;
  apartmentNumber: string | null;
};

/**
 * The car's registered owner as known to the SLPR parking system itself
 * (the `customer` table). Used as a fallback name when we haven't learned the
 * plate as a guest ourselves.
 */
export type RegisteredOwner = {
  name: string;
  apartment: string | null;
};

/**
 * How familiar a plate is, derived purely from the SLPR `log` history. A
 * decision-support signal for the lobbyist on unregistered cars — NOT a
 * verdict. `visits` is deduped: the two entry cameras (1 & 3) fire for the
 * same car within ~30s, so we collapse reads that fall in the same 2-minute
 * bucket, otherwise every visit would count roughly double.
 */
export type PlateVisitStats = {
  visits: number;
  firstSeen: string;
  lastSeen: string;
};

/**
 * Which lane / building a plate belongs to, decided by camera 3 — the camera
 * mounted INSIDE our entrance ramp. Cam 3 only ever sees a car that actually
 * drove down into our garage, so any cam-3 history means it's ours
 * ("boutique"). Plates seen only by the outdoor gate camera (cam 1, which also
 * overlooks the adjacent lot's lane) are the neighbour building ("manhattan").
 */
export type CarBuilding = "boutique" | "manhattan";

export type SlprCarEventRow = {
  id: number;
  plate: string;
  eventTime: string;
  status: string;
  cameraId: number | null;
  duration: string | null;
  imagePath: string | null;
  customerId: number | null;
  guest: RecognizedGuest | null;
  registeredOwner: RegisteredOwner | null;
  visitStats: PlateVisitStats | null;
  building: CarBuilding;
};

export type ForgetGuestState = {
  error?: string;
  errorAt?: number;
  submittedAt?: number;
};

export type KnownGuestRow = {
  id: number;
  carPlate: string;
  guestName: string | null;
  residentId: number | null;
  apartmentId: number | null;
  residentName: string | null;
  apartmentNumber: string | null;
  autoOpen: number;
  createdAt: string;
  updatedAt: string;
};

export type PaginatedKnownGuests = {
  rows: KnownGuestRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/**
 * The single newest gate event, enriched with a recognized-guest or
 * registered-owner name. Powers the lightweight "new car" poller.
 */
export type LatestCarEvent = {
  id: number;
  plate: string;
  status: string;
  eventTime: string;
  guestName: string | null;
  ownerName: string | null;
  apartmentNumber: string | null;
};

/**
 * The car's registered owner from the SLPR `customer` directory, with the extra
 * contact fields the plate-check card shows (phone + employee flag) beyond the
 * lightweight RegisteredOwner used in the live feed.
 */
export type PlateLookupRegisteredCar = {
  plate: string;
  name: string;
  apartment: string | null;
  phone: string | null;
  isEmployee: boolean;
};

/** One historical camera read for the plate-check photo strip. */
export type PlateLookupEvent = {
  id: number;
  eventTime: string;
  status: string;
  cameraId: number | null;
  imagePath: string | null;
};

/**
 * Everything we know about a single plate, consolidated from all three sources:
 * the SLPR `customer` directory (registered owner), our local `resident_guests`
 * memory (learned guest), and the SLPR `log` history (visits + lane + photos).
 */
export type PlateLookupResult = {
  /** The normalized key we actually searched on. */
  query: string;
  /** Best canonical plate to display (from history/registration, else the input). */
  plate: string;
  /** True when the plate matched in at least one source. */
  found: boolean;
  registeredCar: PlateLookupRegisteredCar | null;
  guest: RecognizedGuest | null;
  visitStats: PlateVisitStats | null;
  /** Lane classification — null when the plate has no camera history at all. */
  building: CarBuilding | null;
  recentEvents: PlateLookupEvent[];
};

/** An optional from/to window for scoping a plate's camera history. */
export type PlateDateRange = { from?: string | null; to?: string | null };

/** One camera shot of a single car passage (for the multi-angle gallery). */
export type CarPassageImage = {
  id: number;
  eventTime: string;
  cameraId: number | null;
  status: string;
  imagePath: string | null;
};
