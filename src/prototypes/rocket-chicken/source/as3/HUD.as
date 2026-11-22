package
{
   import flash.display.MovieClip;
   import flash.text.TextField;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol101")]
   public class HUD extends MovieClip
   {
      
      public var fuel:MovieClip;
      
      public var con:MovieClip;
      
      public var feet:TextField;
      
      public var bar:MovieClip;
      
      public var newitem:MovieClip;
      
      public var top:int;
      
      public function HUD()
      {
         super();
      }
   }
}

