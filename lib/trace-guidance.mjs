/**
 * 점선 연습에서만 쓰는 자석 가이드다. 아이가 점선 가까이에서 획을 시작하면
 * 같은 점선 조각에 연필이 붙고, 손이 지나간 구간을 매끈한 점들로 채운다.
 * 자유 그리기와 점선 밖에서 시작한 획에는 적용하지 않는다.
 */

const GUIDE_SIZE = 1024;

function distanceSquared(left, right) {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function closestPointIndex(trace, point) {
  const closed = trace.length > 2 && distanceSquared(trace[0], trace.at(-1)) <= 9;
  const limit = closed ? trace.length - 1 : trace.length;
  let pointIndex = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < limit; index += 1) {
    const candidateDistance = distanceSquared(trace[index], point);
    if (candidateDistance < distance) {
      pointIndex = index;
      distance = candidateDistance;
    }
  }
  return { pointIndex, distance, closed, pointCount: limit };
}

/**
 * @param {Array<Array<{x:number,y:number}>>} traces 1024 좌표계의 점선 조각
 * @param {{x:number,y:number,pressure?:number}} point 0~1 좌표계의 아이 입력
 * @param {number} [maxDistance]
 */
export function lockGuideTrace(traces, point, maxDistance = 84) {
  const canvasPoint = { x: point.x * GUIDE_SIZE, y: point.y * GUIDE_SIZE };
  let lock = null;
  let bestDistance = maxDistance ** 2;
  for (let traceIndex = 0; traceIndex < traces.length; traceIndex += 1) {
    const trace = traces[traceIndex];
    if (!trace?.length) continue;
    const nearest = closestPointIndex(trace, canvasPoint);
    if (nearest.distance > bestDistance) continue;
    bestDistance = nearest.distance;
    lock = { traceIndex, pointIndex: nearest.pointIndex };
  }
  if (!lock) return null;
  const guidePoint = traces[lock.traceIndex][lock.pointIndex];
  return {
    lock,
    point: { x: guidePoint.x / GUIDE_SIZE, y: guidePoint.y / GUIDE_SIZE, pressure: point.pressure ?? 0.5 },
  };
}

function pathIndexes(from, to, pointCount, closed) {
  if (!closed) {
    const direction = to >= from ? 1 : -1;
    const indexes = [];
    for (let index = from + direction; direction > 0 ? index <= to : index >= to; index += direction) indexes.push(index);
    return indexes;
  }
  const forward = (to - from + pointCount) % pointCount;
  const backward = (from - to + pointCount) % pointCount;
  const direction = forward <= backward ? 1 : -1;
  const steps = Math.min(forward, backward);
  return Array.from({ length: steps }, (_, offset) => (from + direction * (offset + 1) + pointCount) % pointCount);
}

/**
 * 잠근 점선 조각 안에서 손이 이동한 구간의 모든 안내점을 돌려준다. 점선 조각을
 * 중간에 바꾸지 않으므로 귀·얼굴처럼 가까운 선에서도 다른 선으로 튀지 않는다.
 * @param {Array<Array<{x:number,y:number}>>} traces
 * @param {{traceIndex:number,pointIndex:number}} lock
 * @param {{x:number,y:number,pressure?:number}} point
 */
export function snapGuideTrace(traces, lock, point) {
  const trace = traces[lock.traceIndex];
  if (!trace?.length) return null;
  const nearest = closestPointIndex(trace, { x: point.x * GUIDE_SIZE, y: point.y * GUIDE_SIZE });
  const indexes = pathIndexes(lock.pointIndex, nearest.pointIndex, nearest.pointCount, nearest.closed);
  return {
    lock: { traceIndex: lock.traceIndex, pointIndex: nearest.pointIndex },
    points: indexes.map((index) => ({
      x: trace[index].x / GUIDE_SIZE,
      y: trace[index].y / GUIDE_SIZE,
      pressure: point.pressure ?? 0.5,
    })),
  };
}
