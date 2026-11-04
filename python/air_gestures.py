"""Air stroke matching, shared in behavior with src/airGesture.ts.

Translation/scale invariant, order preserving DTW, with ±100° rotation search.
Only an explicitly armed combo records orientation; incidental motion is ignored.
"""
import math


def valid_air(value):
    if not isinstance(value, dict):
        return False
    points = value.get('points')
    return (type(value.get('minSimilarity')) is int and 1 <= value['minSimilarity'] <= 100
            and type(value.get('durationMs')) is int and 500 <= value['durationMs'] <= 10000
            and isinstance(points, list) and 2 <= len(points) <= 4096
            and all(isinstance(p, (list, tuple)) and len(p) == 2
                    and all(type(v) in (int, float) and math.isfinite(v) for v in p) for p in points)
            and any(math.hypot(p[0]-points[0][0], p[1]-points[0][1]) > 1e-6 for p in points))


def wrist_point(q, reference):
    w,x,y,z = reference
    a,b,c,d = q
    # conjugate(reference) * q, then rotate the forward [0,1,0] vector.
    rw,rx,ry,rz = (w*a+x*b+y*c+z*d, w*b-x*a-y*d+z*c,
                   w*c+x*d-y*a-z*b, w*d-x*c+y*b-z*a)
    return (2*(rx*ry-rw*rz), -2*(ry*rz+rw*rx))


def path_length(points):
    return sum(math.dist(a, b) for a, b in zip(points, points[1:]))


def fit(points):
    cx = sum(p[0] for p in points)/len(points)
    cy = sum(p[1] for p in points)/len(points)
    scale = max(max(p[0] for p in points)-min(p[0] for p in points),
                max(p[1] for p in points)-min(p[1] for p in points))
    return [((x-cx)/scale, (y-cy)/scale) for x,y in points] if scale > 1e-12 else []


def normalize(points):
    total = path_length(points)
    if len(points) < 2 or total < 1e-6:
        return []
    distances = [0.]
    for a,b in zip(points, points[1:]):
        distances.append(distances[-1]+math.dist(a,b))
    sampled, j = [], 1
    for i in range(64):
        distance = i*total/63
        while j < len(points)-1 and distances[j] < distance:
            j += 1
        t = (distance-distances[j-1])/(distances[j]-distances[j-1] or 1)
        sampled.append(tuple(a+t*(b-a) for a,b in zip(points[j-1],points[j])))
    return fit(sampled)


def similarity(target, actual):
    a,b = normalize(target),normalize(actual)
    if not a or not b:
        return None
    best = math.inf
    for degrees in range(-100,101):
        c,s = math.cos(math.radians(degrees)),math.sin(math.radians(degrees))
        rotated = fit([(x*c-y*s,x*s+y*c) for x,y in b])
        previous = [0.] + [math.inf]*64
        for i in range(1,65):
            row = [math.inf]*65
            for j in range(max(1,i-8),min(64,i+8)+1):
                row[j] = math.dist(a[i-1],rotated[j-1])+min(previous[j-1],previous[j],row[j-1])
            previous = row
        best = min(best,previous[64]/64)
    return math.floor(100*math.exp(-5*best)+.5)
