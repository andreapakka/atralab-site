// Recorded file names from Wikimedia Commons (Incompetech archive).
// CC BY: credit Kevin MacLeod, link to source and license; no audio files bundled.
// Sources: https://incompetech.com/agent-section/ and Commons file/category listings.
// Availability and listening verification must be tested on the deployed site.
window.PFMusic=(()=>{
const groups={
 'Festività':[['Jingle Bells','USUAN1100187'],['Jingle Bells (Calm)','USUAN1100188'],['Silent Night','USUAN1100075'],['Oh, Christmas Tree','USUAN1100366'],['We Wish you a Merry Christmas','USUAN1100369']],
 'Classica':[['Canon in D Major','USUAN1100301'],['Gymnopedie No. 1','USUAN1100787'],['Cello Suite -1 in G - Prelude','USUAN1100298'],['Prelude in C (BWV 846)','USUAN1100689'],['Brandenburg Concerto No. 4 in G, Movement I (Allegro), BWV 1049','USUAN1100303']],
 'Romantica e relax':[['Reminiscing','USUAN1100097'],['Moonstone','USUAN1100145'],['Friday Morning','USUAN1100224'],['Meditation Impromptu 01','USUAN1100163'],['There is Romance','USUAN1100044']],
 'Rock':[['Big Rock','USUAN1100305'],['Cool Rock','USUAN1100279'],['Rock Hybrid','USUAN1100094'],['Sax, Rock, and Roll','USUAN1100086'],['Organic Grunge','USUAN1200001']],
 'Disco e dance':[['Disco con Tutti','USUAN1200091'],['Stringed Disco','USUAN1100059'],['Ether Disco','USUAN1100237'],['Enter the Party','USUAN1100240'],['Disco Lounge','USUAN1100602']],
 'Pop e funk':[['Smooth Move','USUAN1100528'],['Your Call','USUAN1500010'],['Life of Riley','USUAN1400054'],['Protofunk','USUAN1100103'],['Style Funk','USUAN1100058']]
};
const tracks=Object.entries(groups).flatMap(([category,rows])=>rows.map(([title,isrc])=>{const filename=`${title} (ISRC ${isrc}).mp3`.replace(/ /g,'_');return {id:isrc.toLowerCase(),title,category,url:'https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(filename),source:'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(filename),author:'Kevin MacLeod (incompetech.com)',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',original:'https://incompetech.com/music/royalty-free/index.html?isrc='+isrc};}));
return {tracks,async load(){return tracks;},get(id){return tracks.find(t=>t.id===id);}};
})();
