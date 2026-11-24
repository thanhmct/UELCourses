import type { CampusPlace } from "@/lib/campusTour";

export interface CampusPlaceDetails {
  nameKey: string;
  descKey: string;
  tourScene?: string;
  photo?: string;
}

export const CAMPUS_PLACES: Record<CampusPlace, CampusPlaceDetails> = {
  A: {
    nameKey: "campus.buildingA",
    descKey: "campus.desc.A",
    tourScene: "Toàn cảnh Tòa A",
    photo: "/campus/photos/a.webp",
  },
  hall: {
    nameKey: "campus.hall",
    descKey: "campus.desc.hall",
    tourScene: "Hội trường A",
  },
  A3: {
    nameKey: "campus.buildingA3",
    descKey: "campus.desc.A3",
    tourScene: "Toàn cảnh UEL (góc cao)",
    photo: "/campus/photos/a3.webp",
  },
  B1: {
    nameKey: "campus.buildingB1",
    descKey: "campus.desc.B1",
    tourScene: "Tòa B1 - Sảnh tầng G",
    photo: "/campus/photos/b1.webp",
  },
  B2: {
    nameKey: "campus.buildingB2",
    descKey: "campus.desc.B2",
    tourScene: "Toàn cảnh Tòa B1- B2",
    photo: "/campus/photos/b2.webp",
  },
  canteen: {
    nameKey: "campus.canteen",
    descKey: "campus.desc.canteen",
    tourScene: "Toàn cảnh UEL (chính diện)",
  },
  carPark: {
    nameKey: "campus.carPark",
    descKey: "campus.desc.carPark",
    tourScene: "Toàn cảnh UEL (chính diện)",
  },
  bikePark: {
    nameKey: "campus.bikePark",
    descKey: "campus.desc.bikePark",
    tourScene: "Khu Nhà xe",
  },
  lotusPond: {
    nameKey: "campus.lotusPond",
    descKey: "campus.desc.lotusPond",
    photo: "/campus/photos/lotus-pond.webp",
  },
  sports: {
    nameKey: "campus.sports",
    descKey: "campus.desc.sports",
    tourScene: "Sân Thể thao & Nhà thi đấu",
    photo: "/campus/photos/sports.webp",
  },
  gate1: {
    nameKey: "campus.gate1",
    descKey: "campus.desc.gate1",
    tourScene: "Cổng chính UEL",
    photo: "/campus/photos/gate1.webp",
  },
  gate2: {
    nameKey: "campus.gate2",
    descKey: "campus.desc.gate2",
    tourScene: "Toàn cảnh UEL (chính diện)",
  },
  gate2A: {
    nameKey: "campus.gate2A",
    descKey: "campus.desc.gate2A",
    tourScene: "Toàn cảnh UEL (chính diện)",
    photo: "/campus/photos/gate2a.webp",
  },
  gate3: {
    nameKey: "campus.gate3",
    descKey: "campus.desc.gate3",
    tourScene: "Toàn cảnh UEL (chính diện)",
    photo: "/campus/photos/gate3.webp",
  },
};
