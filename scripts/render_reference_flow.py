"""Render Mira's own artwork and words into a reference-paced, in-page story film.
No reference art or code is copied. The films are self-contained and need no API.
"""
import json, math, subprocess, pathlib, random
from PIL import Image, ImageDraw, ImageFilter, ImageOps
ROOT=pathlib.Path(__file__).resolve().parents[1]
DIR=ROOT/'public/content/mira'
DATA=json.loads((DIR/'manifest.json').read_text())
W,H,FPS,DUR=1200,400,12,11
FW,FH=780,400
# The final artwork is rendered from the original anidoodle frames, never from reference assets.
def frames(path):
 cmd=['ffmpeg','-v','error','-i',str(path),'-vf','fps=12,scale=1200:400','-f','rawvideo','-pix_fmt','rgb24','-']
 p=subprocess.Popen(cmd,stdout=subprocess.PIPE)
 size=W*H*3; result=[]
 while True:
  buf=p.stdout.read(size)
  if len(buf)<size: break
  result.append(Image.frombytes('RGB',(W,H),buf))
 p.wait()
 return result

def render(n,page):
 source=frames(DIR/page['video']); assert len(source)>50
 paper=Image.new('RGB',(W,H),'#f6efe0'); d=ImageDraw.Draw(paper)
 for x in range(785,W,4):
  d.line((x,0,x,H),fill=('#f5eedf' if (x//4)%3 else '#f7f1e3'),width=1)
 d.rectangle((0,0,7,H),fill='#ede4d1'); d.line((780,0,780,H),fill='#cfc1a6',width=3)
 d.line((791,12,791,H-12),fill='#e4d7bf',width=1)
 d.arc((994,18,1034,58),20,340,fill='#c3ad89',width=2)
 d.line((817,352,1164,352),fill='#d6c8b0',width=2)
 rng=random.Random(n)
 # Each group of strokes exposes a specific piece of the scene, not one global fade.
 strokes=[]
 for stage in range(5):
  for j in range(115):
   x=rng.randrange(-40,FW); y=rng.randrange(25,380)
   length=rng.randrange(20,110)
   when=.3+stage*.65+j*.024+rng.random()*.4
   strokes.append((when,x,y,length,rng.randrange(9,27)))
 strokes.sort()
 # The frame left after the animation is the original art, with no black flash.
 poster=paper.copy(); poster.paste(ImageOps.mirror(Image.open(DIR/page['image']).convert('RGB').resize((FW,260))), (0,70))
 poster.save(DIR/'clips'/f'{n}-poster.webp',quality=90)
 dest=DIR/'clips'/f'{n}-storybook.mp4'
 proc=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','veryfast','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart',str(dest)],stdin=subprocess.PIPE)
 total=FPS*DUR
 for k in range(total):
  t=k/FPS
  # Pencilled contours first; the painted scene grows from deliberate horizontal strokes.
  st=max(0,min(1,(t-.4)/6.4)); source_idx=min(len(source)-1,round(st*(len(source)-1)))
  art=ImageOps.mirror(source[source_idx].resize((FW,260),Image.Resampling.BILINEAR))
  canvas=paper.copy()
  if t>.25:
   edges=ImageOps.grayscale(art).filter(ImageFilter.FIND_EDGES).point(lambda v: 130 if v>55 else 255)
   edge_layer=Image.new('RGB',art.size,'#f6efe0')
   edge_layer.paste(Image.new('RGB',art.size,'#b6a8a0'),mask=ImageOps.invert(edges))
   canvas.paste(edge_layer,(0,70))
  mask=Image.new('L',(FW,260),0); brush=ImageDraw.Draw(mask)
  progress=max(0,min(1,(t-.3)/6.8))
  # Horizontal lines extend coherently across the spread; slight row offsets make an ink-on-paper edge.
  for row in range(0,260,6):
   phase=((row*17+n*31)%47)/47
   xmax=int((progress*1.24-phase*.24)*FW)
   if xmax>0: brush.line((0,row,min(FW,xmax),row),fill=255,width=7)
  if t>=7.3: mask=Image.new('L',(FW,260),255)
  canvas.paste(art,(0,70),mask)
  draw=ImageDraw.Draw(canvas)
  # After the scene lands, tiny lights pulse while the character film holds its pose.
  if t>7:
   for j in range(7):
    xx=(j*151+n*29)%750; yy=95+(j*83+n*7)%205
    pulse=max(0,math.sin(t*4+j*1.9))
    if pulse>.85:
     rad=1+pulse*2; draw.ellipse((xx-rad,yy-rad,xx+rad,yy+rad),fill='#f9e3a4')
  proc.stdin.write(canvas.tobytes())
 proc.stdin.close(); rc=proc.wait()
 if rc: raise RuntimeError(f'ffmpeg failed {n}: {rc}')
 print(n,dest.stat().st_size,flush=True)

for i,page in enumerate(DATA['pages'],1): render(i,page)
