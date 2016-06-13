// helpers
function html2text(html) {
  html = html.replace(/\<(:?(:?script)|(:?style))(:?\>|(:?\s+[^>]*\>))(:?.|\n)*?\<\/(:?(:?script)|(:?style))\>/g,'')
  var tmp = document.createElement("DIV");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}
var scanned = { "Philosophy": true }
function scan(resp) {
  try {
    var txt = resp.parse.text['*']
    var links = resp.parse.links.filter( function(link) {
      return link.ns == 0 && link.exists == "" && !scanned[link['*']]
    }).map( function(link) {
      return link['*']
    })
    console.log(links);
  } catch (err) {
    console.error(resp,err);
  }
  qs('#wikipage').remove();
  if(!txt) {
    console.error("ERROR : handling a page ", resp);
    return;
  }
  txt = html2text(txt);
  if( smarkov.scan(txt) && links.length > 0)
    getPage( links[ Math.floor(Math.random()*links.length) ] );
  
  //say("GAWK! smarter now")
}

function getPage(name) {
  //var url = "http://en.wikipedia.org/w/api.php?format=json&action=query&titles="+ name +"&prop=revisions&callback=console.log&rvprop=content"
  var url = "https://en.wikipedia.org/w/api.php?format=json&callback=scan&action=parse&prop=links|text&page="+ encodeURIComponent(name)
  scanned[name] = true
  console.log(name);
  var page = document.createElement('script');
  page.src = url;
  page.id = "wikipage"
  document.head.appendChild(page)
}

var qs = document.querySelector.bind(document);

// Markov Chain Stuff
function Smarkov(db) {  // in memorial to the shiny Markov plugin once created for rbot
  var N = 2;
  var EXPAND_MAX = 50;
  var self  = this;

  function Nplet(nplet) {
    this.right = {};
    this.left = {};
    
    if (nplet instanceof Array)
      nplet = nplet.join(' ');
    if(nplet) {
      this.str = nplet;
      var data = db[nplet]
      if(typeof data !== 'undefined') {
        data = JSON.parse(data);
        var assign = function(prop) {
          if (typeof data[prop] !== 'undefined' )
            this[prop] = data[prop]
        }.bind(this);
        ['right', 'right_total', 'left', 'left_total'].forEach(assign);
        console.log('loading ... :', this);
      }
    }
  }
  Nplet.prototype = {
    str: '',
    // right: { },
    right_total: 0,
    // left: { },
    left_total: 0,
    save: function() {
      //console.log('saving ..' ,this)
        db[this.str] = JSON.stringify(this)
    },
    expand: function(direction) {  // invoke with direction = 'lefft' or 'right'
      var tot = this[direction +"_total"];
      var max = Math.floor(Math.random() * tot);
      var cur = 1;
      for (var word in this[direction]) {
        cur += this[direction][word];
        if(cur >= max)
          return word;
      }
      console.error(tot, max, cur, direction, this)
      return "Gawk!#EOF#Gawk!";
    }
  }

  function process_nplets(msg, left) {
    if(msg.length < N)
      return ;

    var nplet_name = msg.slice(0,N)
    var right = msg[N];
    var nplet = new Nplet(nplet_name);
    var t;
    
    if (typeof right  == 'undefined') 
      right = '#EOF#';
    t = nplet.right[right]
    if (typeof t == 'undefined' )
      t = 0;
    nplet.right[right] = t+1;
    nplet.right_total += 1;
    
    if (typeof left == 'undefined')
      left = '#EOF#';
    t = nplet.left[left];
    if (typeof t == 'undefined' )
      t = 0;
    nplet.left[left] = t+1;
    nplet.left_total += 1;
    try {
      nplet.save();
    } catch (e){
      self.outOfMemory = true
    }
    var ret = process_nplets(msg.slice(1, msg.length), msg[0]);
    if(ret && ret.left_total+ret.right_total >= nplet.left_total+nplet.right_total)
      return ret
    else
      return nplet
  }

  function analyze(str, previous) {
    var msg;

    if (! (str instanceof Array))
      msg = str.trim().toLowerCase().replace(/[^\w\s,]/g,'').split(/\s+/);
    else
      msg = str;
    //console.log('processing : ',msg);
    var most_relevant = process_nplets(msg);
    //console.log(most_relevant)
    return most_relevant;
  }

  function scan(doc) {
    doOne = function(match) {
    if(!self.outOfMemory)
      setInterval(analyze.bind(this,match),0);
    }
    doc.replace(/.*?(?:[.!?\n]|$)/g, doOne);
    if(!self.outOfMemory)
      return true; 
  }
  
  function generate(nplet) {
    console.log(nplet.str);
    var msg = nplet.str.split(' ');
    //return nplet.expand('left') +' '+ str +' '+ nplet.expand('right')
    var re;
    for ( var c = 0; c <= EXPAND_MAX; c++) {  
      var nextOne = new Nplet(msg.slice(0, N) ).expand('left');
      if (re = nextOne.match(/#EOF#(.*)/)) {
        msg.unshift(re[1]);
        break;
      } else {
        msg.unshift(nextOne);
      }
    }
    if(c>=EXPAND_MAX)
      msg.unshift('Gawk!');
    for ( var c = 0; c <= EXPAND_MAX; c++) {  
      var nextOne = new Nplet(msg.slice(-N, msg.length)).expand('right');
      if (re = nextOne.match(/(.*)#EOF#/)){
        msg.push(re[1]);
        break;
      } else {
        msg.push(nextOne);
      }
    }
    
    if(c>=EXPAND_MAX)
      msg.push('Gawk!');
    return msg.join(' ')
  }

  return {
    'generate': generate,
    'analyze': analyze,
    'scan': scan
  }
}

var smarkov = new Smarkov(localStorage)

// Interface Stuff

function say(str) {
  qs('#text').textContent = str;
}

function init() {
  var el = qs('#msg');
  qs('#say').addEventListener('click', function(){
    console.log("you said : ",el.value);
    if(el.value) {
      var nplet = smarkov.analyze(el.value)
      say(
        nplet ? smarkov.generate(nplet) : el.value+ " Gawk!"
      );
    }
    else
      say("Gawk!")
  });
  qs('#scan').addEventListener('click', function(){
    smarkov.scan(qs('#doc').value);
    say("Gawk! Me's smarter now")
  })

}

window.onload = init
