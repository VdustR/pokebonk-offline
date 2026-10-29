// The offline preparation subprocess must use only the checked-out snapshot.
// Rejecting fetch also catches accidental imports of the online sync path.
globalThis.fetch=async()=>{throw new Error('Network is disabled for offline snapshot preparation');};
