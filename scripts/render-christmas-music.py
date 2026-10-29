"""Render the original Candy Workshop score with FluidSynth and GeneralUser GS.

Requires FluidSynth, FFmpeg and a separately downloaded GeneralUser GS SoundFont.
The SoundFont is a build input and is never bundled with the game.
"""
import argparse
from pathlib import Path
import struct
import subprocess
import tempfile

BPM, BARS, PPQ, RATE = 125, 32, 480, 44100
LOOP_SECONDS = BARS * 4 * 60 / BPM
# G major: a four-bar hook, answering phrases, a softer bridge, and a reprise.
MELODY = [
 [74,71,67,None,71,74,76,74], [76,None,74,72,71,69,67,None],
 [69,None,74,78,76,None,74,None], [71,69,67,None,None,67,69,71],
 [76,74,71,None,74,76,79,None], [72,None,76,74,72,71,69,None],
 [69,71,74,None,78,76,74,69], [71,None,67,None,None,None,74,None],
 [76,None,79,76,74,None,72,None], [74,71,67,None,71,74,79,None],
 [72,None,76,74,72,71,69,None], [69,74,78,None,76,74,72,None],
 [76,None,79,76,74,72,71,69], [71,None,74,71,67,None,69,71],
 [69,71,74,78,81,None,78,74], [71,69,67,None,None,None,None,None],
 [71,None,74,None,79,None,76,None], [76,None,74,72,71,None,67,None],
 [69,None,72,None,76,74,72,None], [74,None,78,76,74,None,69,None],
 [76,None,79,76,74,None,72,None], [74,None,71,None,67,None,69,71],
 [69,71,74,None,78,76,74,69], [71,None,67,None,None,None,69,71],
 [74,71,67,None,71,74,76,79], [76,None,74,72,71,69,67,None],
 [69,None,74,78,76,None,74,69], [71,69,67,None,None,67,69,71],
 [76,74,72,None,79,76,74,72], [74,71,67,None,71,74,79,None],
 [69,71,74,78,81,78,76,74], [71,None,69,None,67,None,None,None],
]
G,C,D,EM,AM = [55,59,62],[48,52,55],[50,54,57],[52,55,59],[45,48,52]
CHORDS = [G,C,D,G,EM,AM,D,G,C,G,AM,D,C,G,D,G,C,G,AM,D,C,G,D,G,G,C,D,G,C,G,D,G]


def vlq(value):
    result = [value & 127]
    while value >> 7:
        value >>= 7
        result.insert(0, (value & 127) | 128)
    return bytes(result)


def midi_file(path, pulse=False):
    events = []
    def event(tick, data): events.append((int(round(tick)), bytes(data)))
    def cc(channel, number, value): event(0, [176+channel, number, value])
    def note(channel, pitch, beat, length, velocity):
        event(beat*PPQ, [144+channel, pitch, velocity])
        event((beat+length)*PPQ, [128+channel, pitch, 0])
    def program(channel, preset, volume, pan):
        event(0, [192+channel, preset]); cc(channel,7,volume);cc(channel,10,pan);cc(channel,91,28)
    # Real sampled instruments; celesta carries the hook, glock adds punctuation.
    program(0,8,90,54); program(1,9,65,79); program(2,45,83,43)
    program(3,32,96,64); program(4,73,72,75); cc(9,7,70);cc(9,91,14)
    tempo = round(60_000_000/BPM)
    event(0,b'\xff\x51\x03'+tempo.to_bytes(3,'big'))
    # Three repeats establish the reverb/release tail across the final loop seam.
    for repeat in range(3):
        for bar in range(BARS):
            origin=(repeat*BARS+bar)*4; chord=CHORDS[bar]
            if pulse:
                for eighth in range(8):
                    beat=origin+eighth/2
                    note(9,83,beat,.12,36 if eighth%2==0 else 24)
                    if eighth in [2,6]: note(9,37,beat,.10,34)
                    if eighth in [3,7]: note(9,54,beat,.13,25)
                # Quiet upper plucks add motion without changing the song's tempo.
                for eighth in [1,3,5,7]:
                    note(2,chord[(eighth//2)%3]+24,origin+eighth/2,.15,39)
                continue
            for eighth,pitch in enumerate(MELODY[bar]):
                if pitch is None: continue
                beat=origin+eighth/2+(0.025 if eighth%2 else 0)
                following=MELODY[bar][eighth+1] if eighth<7 else None
                duration=.38 if following is not None else .75
                # Bridge switches to flute; the final hook returns on celesta.
                lead=4 if 16<=bar<24 else 0
                velocity=(67 if eighth%4==0 else 57)+(bar%3-1)*2
                note(lead,pitch,beat,duration,velocity)
                if eighth==0 and bar%4 in [0,2]: note(1,pitch+12,beat,.7,35)
            for beat in [0,2]: note(3,chord[0]-12+(7 if beat==2 else 0),origin+beat,.65,73 if beat==0 else 61)
            for beat in [1,3]:
                for i,pitch in enumerate(chord): note(2,pitch+12,origin+beat+i*.012,.24,48+i*2)
            if bar>=8 and bar%4 in [1,3]:
                for i,pitch in enumerate(reversed(chord)):note(2,pitch+24,origin+3+i*.25,.16,39)
            for beat in [0,1,2,3]: note(9,83,origin+beat,.12,24 if beat%2==0 else 18)
            for beat in [1,3]:note(9,76,origin+beat,.09,23)
    events.sort(key=lambda e:(e[0],e[1][0]>=144 and e[1][0]<160))
    body=bytearray();previous=0
    for tick,data in events:body.extend(vlq(tick-previous)+data);previous=tick
    end=int(3*BARS*4*PPQ)
    body.extend(vlq(max(0,end-previous))+b'\xff\x2f\x00')
    path.write_bytes(b'MThd'+struct.pack('>IHHH',6,0,1,PPQ)+b'MTrk'+struct.pack('>I',len(body))+body)


def render(sf2, output):
    output.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='candy-workshop-') as work:
        work=Path(work)
        for stem in ['theme','pulse']:
            midi=work/(stem+'.mid');raw=work/(stem+'.wav');midi_file(midi,pulse=stem=='pulse')
            subprocess.run(['fluidsynth','-ni','-r',str(RATE),'-g','.6','-C','0','-o','synth.reverb.room-size=0.38','-o','synth.reverb.level=0.22','-F',str(raw),'-T','wav',str(sf2),str(midi)],check=True,stdout=subprocess.DEVNULL)
            # Keep the middle repeat: both ends already contain matching release tails.
            level=-18 if stem=='theme' else -27
            result=output/f'candy-workshop-{stem}.mp3'
            subprocess.run(['ffmpeg','-v','error','-y','-i',str(raw),'-af',f'atrim=start={LOOP_SECONDS}:duration={LOOP_SECONDS},asetpts=PTS-STARTPTS,highpass=f=45,lowpass=f=11000,loudnorm=I={level}:TP=-3:LRA=7','-ar',str(RATE),'-ac','2','-c:a','libmp3lame','-b:a','128k','-write_xing','1','-metadata','title=Candy Workshop — '+stem,'-metadata','artist=Trick or Take',str(result)],check=True)
            print(f'{result.name}: {result.stat().st_size:,} bytes, {LOOP_SECONDS:.2f}s')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--soundfont',type=Path,required=True)
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'public/party/assets/music')
    args=parser.parse_args();render(args.soundfont,args.output)
