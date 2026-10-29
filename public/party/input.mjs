export function pollCommand(room, viewerId, holding, seq) {
  const player=room?.players.find(p=>p.id===viewerId);
  if(room?.phase==='playing'&&player&&!player.left
      &&(Boolean(player.holding)!==holding||(player.inputSeq??-1)<seq)) {
    // A failed edge request must be retried until the server acknowledges it.
    // A new sequence also repairs a local safety release after losing connection.
    const nextSeq=(player.inputSeq??-1)>=seq?player.inputSeq+1:seq;
    return {command:{type:'hold',held:holding,seq:nextSeq,roundIndex:room.roundIndex},seq:nextSeq};
  }
  return {command:{type:'heartbeat'},seq};
}
