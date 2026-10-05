export interface Point {
  lat: number;
  lng: number;
  population: number;
  communeName: string;
}

export interface Cluster {
  centroid: { lat: number; lng: number };
  points: Point[];
  totalPopulation: number;
}

export function kMeansPondere(points: Point[], k: number, maxIter = 50): Cluster[] {
  let centroids = points
    .slice()
    .sort(() => 0.5 - Math.random())
    .slice(0, k)
    .map((p) => ({ lat: p.lat, lng: p.lng }));

  let clusters: Cluster[] = [];

  for (let iter = 0; iter < maxIter; iter++) {
    clusters = centroids.map((c) => ({ centroid: c, points: [], totalPopulation: 0 }));

    for (const p of points) {
      let closestIdx = 0;
      let minDist = Infinity;
      centroids.forEach((c, idx) => {
        const dist = haversine(p.lat, p.lng, c.lat, c.lng);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = idx;
        }
      });
      clusters[closestIdx].points.push(p);
      clusters[closestIdx].totalPopulation += p.population;
    }

    const newCentroids = clusters.map((cl) => {
      if (cl.points.length === 0) return cl.centroid;
      const totalPop = cl.points.reduce((s, p) => s + p.population, 0);
      if (totalPop === 0) return cl.centroid;
      const lat = cl.points.reduce((s, p) => s + p.lat * p.population, 0) / totalPop;
      const lng = cl.points.reduce((s, p) => s + p.lng * p.population, 0) / totalPop;
      return { lat, lng };
    });

    centroids = newCentroids;
  }

  return clusters.filter((c) => c.points.length > 0);
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}