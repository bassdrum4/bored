package
{
   import flash.display.MovieClip;
   import flash.text.TextField;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol903")]
   public class Item extends MovieClip
   {
      
      public var rak:MovieClip;
      
      public var ca:TextField;
      
      public var para:MovieClip;
      
      public var purch:MovieClip;
      
      public var field:MovieClip;
      
      public var newicon:MovieClip;
      
      public var belt:MovieClip;
      
      public var helm:MovieClip;
      
      public var num:int;
      
      public var type:String;
      
      public function Item()
      {
         super();
         addFrameScript(0,this.frame1,1,this.frame2,2,this.frame3);
      }
      
      internal function frame1() : *
      {
         this.ca.text = "$" + this.helm.num;
         this.num = this.helm.num;
      }
      
      internal function frame2() : *
      {
         this.ca.text = "$" + this.belt.num;
         this.num = this.belt.num;
      }
      
      internal function frame3() : *
      {
         this.ca.text = "$" + this.rak.num;
         this.num = this.rak.num;
      }
   }
}

