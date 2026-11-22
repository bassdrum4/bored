package
{
   import flash.display.MovieClip;
   import flash.display.SimpleButton;
   import flash.display.Sprite;
   import flash.text.TextField;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol658")]
   public class Store extends Sprite
   {
      
      public var ca:TextField;
      
      public var nex:SimpleButton;
      
      public var prev:SimpleButton;
      
      public var cCon:MovieClip;
      
      public var cat:String = "rocket";
      
      public var items:Vector.<String>;
      
      public var container:Scroller = new Scroller();
      
      public var scroller:MovieClip;
      
      public function Store()
      {
         super();
         addChild(this.container);
         setChildIndex(this.nex,numChildren - 1);
         setChildIndex(this.prev,numChildren - 1);
      }
      
      public function Update() : void
      {
         this.ca.text = "$" + globalVars.cash;
         this.items = globalVars["t" + this.cat];
         this.container.through = true;
         this.container.Child = this.items.length - 1;
         this.container._objects = this.container;
         this.container._stage = globalVars.home.stage;
         this.container.own = globalVars[this.cat + "s"];
         this.container.cCon = this.cCon;
         this.container.prev = this.prev;
         this.container.nex = this.nex;
         this.container.scroller = this.scroller;
         this.container.arr = globalVars["u" + this.cat];
         this.container._update = 1;
         this.container.x = 0;
         if(this.cat == "helmet")
         {
            if(this.container.childer != 1)
            {
               this.container.change = true;
            }
            this.container.childer = 1;
         }
         else if(this.cat == "belt")
         {
            if(this.container.childer != 2)
            {
               this.container.change = true;
            }
            this.container.childer = 2;
         }
         else
         {
            if(this.container.childer != 3)
            {
               this.container.change = true;
            }
            this.container.childer = 3;
         }
         this.container.Parent = "Item";
         this.container.on = true;
         this.container.fastScroll = true;
      }
   }
}

