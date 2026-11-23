// Astronomical approximation described by Hồ Ngọc Đức:
// https://www.xemamlich.uhm.vn/calrules.html
const MOON_EPOCH = 2415021.076998695;
const MONTH_DAYS = 29.530588853;
const UTC_OFFSET_DAYS = 7 / 24;
const UNIX_JULIAN_DAY = 2440588;
const DAY_MS = 86_400_000;
const sin = (degrees: number) => Math.sin(degrees * Math.PI / 180);

function newMoon(index: number): number {
  const t = index / 1236.85;
  const solar = 359.2242 + 29.10535608 * index - 0.0000333 * t ** 2 - 0.00000347 * t ** 3;
  const lunar = 306.0253 + 385.81691806 * index + 0.0107306 * t ** 2 + 0.00001236 * t ** 3;
  const latitude = 21.2964 + 390.67050646 * index - 0.0016528 * t ** 2 - 0.00000239 * t ** 3;
  const mean = 2415020.75933 + 29.53058868 * index + 0.0001178 * t ** 2 - 0.000000155 * t ** 3;
  const correction = (0.1734 - 0.000393 * t) * sin(solar) + 0.0021 * sin(2 * solar)
    - 0.4068 * sin(lunar) + 0.0161 * sin(2 * lunar) - 0.0004 * sin(3 * lunar)
    + 0.0104 * sin(2 * latitude) - 0.0051 * sin(solar + lunar) - 0.0074 * sin(solar - lunar)
    + 0.0004 * sin(2 * latitude + solar) - 0.0004 * sin(2 * latitude - solar)
    - 0.0006 * sin(2 * latitude + lunar) + 0.001 * sin(2 * latitude - lunar)
    + 0.0005 * sin(2 * lunar + solar) + 0.00033 * sin(166.56 + 132.87 * t - 0.009173 * t ** 2);
  const deltaTime = -0.000278 + 0.000265 * t + 0.000262 * t ** 2;
  return Math.floor(mean + correction - deltaTime + 0.5 + UTC_OFFSET_DAYS);
}

function solarSector(day: number): number {
  const t = (day - 2451545.5 - UTC_OFFSET_DAYS) / 36525;
  const anomaly = 357.5291 + 35999.0503 * t - 0.0001559 * t ** 2 - 0.00000048 * t ** 3;
  const longitude = 280.46645 + 36000.76983 * t + 0.0003032 * t ** 2
    + (1.9146 - 0.004817 * t - 0.000014 * t ** 2) * sin(anomaly)
    + (0.019993 - 0.000101 * t) * sin(2 * anomaly) + 0.00029 * sin(3 * anomaly);
  return Math.floor(((longitude % 360 + 360) % 360) / 30);
}

function winterMoon(year: number): number {
  const dec31 = Date.UTC(year, 11, 31) / DAY_MS + UNIX_JULIAN_DAY;
  const index = Math.floor((dec31 - 2415021) / MONTH_DAYS);
  return solarSector(newMoon(index)) >= 9 ? index - 1 : index;
}

/** Gregorian dates of the first day of Tết and Giỗ Tổ Hùng Vương, calculated in UTC+7. */
export function vietnameseLunarHolidays(year: number): { tet: string; hungKings: string } | null {
  if (year < 1900 || year > 2099) return null;
  const start = winterMoon(year - 1);
  const end = winterMoon(year);
  const leapYear = end - start === 13;
  let leapConsumed = false;
  let month = 11;
  let tet = "";
  for (let moon = start + 1; moon < end; moon++) {
    const day = newMoon(moon);
    if (leapYear && !leapConsumed && solarSector(day) === solarSector(newMoon(moon + 1))) {
      leapConsumed = true;
      continue;
    }
    month = month % 12 + 1;
    const toIso = (julianDay: number) => new Date((julianDay - UNIX_JULIAN_DAY) * DAY_MS).toISOString().slice(0, 10);
    if (month === 1) tet = toIso(day);
    if (month === 3) return { tet, hungKings: toIso(day + 9) };
  }
  return null;
}
