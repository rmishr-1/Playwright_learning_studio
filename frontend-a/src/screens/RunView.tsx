import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getLastFrame, openRunStream } from '../api/client';
import type { RunStreamEvent } from '../../../shared/contracts/run';

/**
 * The detached live-browser window. Reached only via the RunOverlay's Detach button, which
 * opens `/run/:runId` in its own window. Two sources feed it: GET /run/:runId/last-frame for
 * whatever was already on screen (a run already under way, or already finished - the window's
 * own WebSocket connection has missed everything up to now, see runner.ts), and the WebSocket
 * itself for anything from this point on. There is no editor here and nothing to run; this
 * window only ever watches.
 */
export function RunView() {
  const { runId } = useParams();
  const [image, setImage] = useState<string | null>(null);
  const [ended, setEnded] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    getLastFrame(runId)
      .then(({ frame, status }) => {
        if (frame) setImage(frame);
        if (status) setEnded(status);
      })
      .catch(() => undefined);
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    const close = openRunStream(runId, (event: RunStreamEvent) => {
      if (event.event === 'frame') setImage(event.data);
      else if (event.event === 'ended') setEnded(event.status);
    });
    return close;
  }, [runId]);

  return (
    <div className="run-view">
      {image ? (
        <img src={'data:image/jpeg;base64,' + image} alt="The browser being driven by your code" />
      ) : (
        <span className="waiting">Waiting for the browser…</span>
      )}
      {ended && <span className="run-view-ended">run {ended}</span>}
    </div>
  );
}
