package
{
   import flash.display.MovieClip;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol108")]
   public dynamic class transit extends MovieClip
   {
      
      public var t:MovieClip;
      
      public function transit()
      {
         super();
         addFrameScript(0,this.frame1);
      }
      
      internal function frame1() : *
      {
         stop();
      }
   }
}

