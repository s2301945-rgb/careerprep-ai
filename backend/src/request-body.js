export function readBoundedRequestBody(request, maxBytes, { tooLargeError, invalidError }) {
  const drainRequest = () => {
    const swallow = () => {};
    const cleanupDrain = () => {
      request.off("data", swallow);
      request.off("error", swallow);
      request.off("end", cleanupDrain);
      request.off("close", cleanupDrain);
    };
    request.on("data", swallow);
    request.on("error", swallow);
    request.once("end", cleanupDrain);
    request.once("close", cleanupDrain);
    request.resume();
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    let total = 0;
    let chunks = [];

    const cleanup = () => {
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
      request.off("aborted", onAborted);
      request.off("close", onClose);
    };
    const rejectAndDrain = (error) => {
      if (settled) return;
      settled = true;
      chunks = [];
      reject(error);
      // Keep consuming the request after returning 413 so Node can send the
      // response without resetting a chunked upload midway through the socket.
      request.resume();
    };
    const onData = (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        rejectAndDrain(tooLargeError());
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      if (settled) {
        cleanup();
        return;
      }
      settled = true;
      const body = Buffer.concat(chunks, total);
      chunks = [];
      cleanup();
      resolve(body);
    };
    const onError = () => {
      if (settled) {
        cleanup();
        return;
      }
      settled = true;
      chunks = [];
      cleanup();
      reject(invalidError());
    };
    const onAborted = () => onError();
    const onClose = () => {
      if (!settled && !request.complete) onError();
      else if (settled) cleanup();
    };

    const declaredLength = request.headers["content-length"];
    if (declaredLength !== undefined && Number(declaredLength) > maxBytes) {
      settled = true;
      drainRequest();
      reject(tooLargeError());
      return;
    }

    request.on("data", onData);
    request.on("end", onEnd);
    request.on("error", onError);
    request.on("aborted", onAborted);
    request.on("close", onClose);
    request.resume();
  });
}
