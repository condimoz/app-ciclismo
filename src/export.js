const iso = (ms) => new Date(ms).toISOString();

export function toCSV(session) {
  const rows = ['tempo_iso,decorrido_s,fc_bpm,rr_ms,passo'];
  for (const x of session.samples) {
    const name = session.laps.find((l) => l.idx === x.step)?.name ?? '';
    rows.push(
      [
        iso(x.t),
        ((x.t - session.startedAt) / 1000).toFixed(0),
        x.hr ?? '',
        (x.rr || []).join(';'),
        `"${name}"`,
      ].join(','),
    );
  }
  return rows.join('\n');
}

export function toTCX(session) {
  const end = session.endedAt ?? session.samples.at(-1)?.t ?? session.startedAt;
  const laps = session.laps.map((l) => ({ ...l, end: l.end ?? end }));
  const lapXml = laps
    .map((l) => {
      const pts = session.samples.filter((x) => x.t >= l.start && x.t < l.end && x.hr != null);
      const hrs = pts.map((p) => p.hr);
      const avgHr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : 0;
      const maxHr = hrs.length ? Math.max(...hrs) : 0;
      const track = pts
        .map(
          (p) =>
            `<Trackpoint><Time>${iso(p.t)}</Time><HeartRateBpm><Value>${p.hr}</Value></HeartRateBpm></Trackpoint>`,
        )
        .join('');
      return (
        `<Lap StartTime="${iso(l.start)}"><TotalTimeSeconds>${Math.round((l.end - l.start) / 1000)}</TotalTimeSeconds>` +
        `<DistanceMeters>0</DistanceMeters><Calories>0</Calories>` +
        `<AverageHeartRateBpm><Value>${avgHr}</Value></AverageHeartRateBpm>` +
        `<MaximumHeartRateBpm><Value>${maxHr}</Value></MaximumHeartRateBpm>` +
        `<Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod><Track>${track}</Track></Lap>`
      );
    })
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities>` +
    `<Activity Sport="${session.sport || 'Other'}"><Id>${iso(session.startedAt)}</Id>${lapXml}</Activity></Activities></TrainingCenterDatabase>`
  );
}
