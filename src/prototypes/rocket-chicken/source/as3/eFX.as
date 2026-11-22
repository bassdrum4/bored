package
{
   import flash.display.MovieClip;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol759")]
   public dynamic class eFX extends MovieClip
   {
      
      public var ex:MovieClip;
      
      public function eFX()
      {
         super();
         addFrameScript(0,this.frame1);
      }
      
      internal function frame1() : *
      {
         stop();
         visible = false;
      }
   }
}

