package
{
   import flash.display.MovieClip;
   import flash.display.SimpleButton;
   import flash.text.TextField;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol654")]
   public class Yourbird extends MovieClip
   {
      
      public var fuel:TextField;
      
      public var prot:TextField;
      
      public var wei:TextField;
      
      public var prevb:SimpleButton;
      
      public var prevc:SimpleButton;
      
      public var con:TextField;
      
      public var nexa:SimpleButton;
      
      public var nexb:SimpleButton;
      
      public var nexc:SimpleButton;
      
      public var c1:MovieClip;
      
      public var c2:MovieClip;
      
      public var note:MovieClip;
      
      public var c3:MovieClip;
      
      public var preva:SimpleButton;
      
      public var bird:MovieClip;
      
      public var container1:Scroller = new Scroller();
      
      public var container2:Scroller = new Scroller();
      
      public var container3:Scroller = new Scroller();
      
      public function Yourbird()
      {
         super();
         this.c1.addChild(this.container1);
         this.c2.addChild(this.container2);
         this.c3.addChild(this.container3);
      }
      
      public function Update() : void
      {
         this.container1.dir = 1;
         this.container1._objects = this.container1;
         this.container1._stage = globalVars.home.stage;
         this.container1.cCon = this.c1.cCon;
         this.container1.childer = 1;
         this.container1.arr = globalVars.helmets;
         this.container1._update = 1;
         this.container1.Parent = "bItem";
         this.container1.on = true;
         this.container1.mask = this.c1.mas;
         this.container1.prev = this.preva;
         this.container1.nex = this.nexa;
         this.container2.dir = 1;
         this.container2._objects = this.container2;
         this.container2._stage = globalVars.home.stage;
         this.container2.arr = globalVars.rockets;
         this.container2._update = 1;
         this.container2.Parent = "bItem";
         this.container2.on = true;
         this.container2.mask = this.c2.mas;
         this.container2.childer = 3;
         this.container2.cCon = this.c2.cCon;
         this.container2.prev = this.prevb;
         this.container2.nex = this.nexb;
         this.container3.dir = 1;
         this.container3._objects = this.container3;
         this.container3._stage = globalVars.home.stage;
         this.container3.arr = globalVars.belts;
         this.container3.childer = 2;
         this.container3._update = 1;
         this.container3.Parent = "bItem";
         this.container3.on = true;
         this.container3.mask = this.c3.mas;
         this.container3.cCon = this.c3.cCon;
         this.container3.prev = this.prevc;
         this.container3.nex = this.nexc;
      }
   }
}

